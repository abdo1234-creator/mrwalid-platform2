const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// استدعاء الموديلات
const User = require('../models/User');
const Code = require('../models/Code');
const Lesson = require('../models/Lesson');
const Quiz = require('../models/Quiz');

// [إضافة] راوت التحقق من الجلسة (Verification Middleware logic)
// ده اللي الفرونت إند بينادي عليه كل شوية عشان يتأكد إن الطالب مطردش
router.get('/verify-session/:studentId/:sessionId', async (req, res) => {
    try {
        const { studentId, sessionId } = req.params;
        const student = await User.findById(studentId).select('currentSessionId isSuspended');

        if (!student) return res.status(404).json({ success: false, message: "الطالب غير موجود" });

        // لو الـ sessionId اللي باعتها الطالب مش زي اللي في الداتابيز
        if (student.currentSessionId !== sessionId) {
            return res.json({ 
                success: false, 
                kickOut: true, 
                message: "تم تسجيل الدخول من جهاز آخر، سيتم الخروج ⚠️" 
            });
        }

        res.json({ success: true, isSuspended: student.isSuspended });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 1. راوت شحن كود الشهر
router.post('/activate-code', async (req, res) => {
    try {
        const { code, studentId } = req.body;
        const student = await User.findById(studentId);
        if (!student) return res.status(404).json({ success: false, message: "الطالب غير موجود" });

        if (student.isSuspended) {
            return res.status(403).json({ 
                success: false, 
                message: "عذراً يا هندسة، حسابك معلق حالياً. يرجى التواصل مع الدعم الفني لتفعيله ⚠️",
                isSuspended: true 
            });
        }

        const foundCode = await Code.findOne({ code: code, isUsed: false, grade: student.grade });
        if (!foundCode) return res.status(404).json({ success: false, message: "الكود غير صالح ❌" });

        foundCode.isUsed = true;
        foundCode.usedBy = studentId;
        foundCode.usedAt = new Date();
        await foundCode.save();

        await User.findByIdAndUpdate(studentId, {
            $push: { subscriptions: { month: foundCode.month, branch: foundCode.branch, expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } }
        });

        res.json({ success: true, message: `مبروك يا بشمهندس! تم تفعيل شهر ${foundCode.month} بنجاح ✅` });
    } catch (err) {
        res.status(500).json({ success: false, message: "مشكلة في التفعيل" });
    }
});

// 2. جلب الدروس والاختبارات (تم إضافة فحص الـ Session)
router.get('/my-lessons/:studentId', async (req, res) => {
    try {
        // [تعديل] بنستقبل الـ sessionId من الـ Query String للتأكد
        const { sessionId } = req.query; 
        const student = await User.findById(req.params.studentId);
        if (!student) return res.status(404).json({ message: "الطالب غير موجود" });

        // [حماية] منع تعدد الأجهزة
        if (sessionId && student.currentSessionId !== sessionId) {
            return res.json({ success: false, kickOut: true, message: "جهاز آخر سجل دخول" });
        }

        const isSuspended = student.isSuspended || false;
        if (isSuspended) {
            return res.json({ success: true, lessons: [], quizzes: [], isSuspended: true, results: student.scores || [], message: "الحساب معلق" });
        }

        if (!student.subscriptions || student.subscriptions.length === 0) {
            return res.json({ success: true, lessons: [], quizzes: [], isSuspended: false, results: student.scores || [], message: "اشحن كود لتفعيل المحتوى" });
        }

        const query = { grade: student.grade, $or: student.subscriptions.map(sub => ({ month: sub.month })) };
        const [allLessons, standaloneQuizzes] = await Promise.all([
            Lesson.find(query).sort({ createdAt: -1 }),
            Quiz.find(query).sort({ createdAt: -1 })
        ]);

        const checkIfTaken = (id, title) => {
            return student.scores.some(s => (s.quizId && String(s.quizId) === String(id)) || (s.lessonId && String(s.lessonId) === String(id)) || (s.quizTitle === title));
        };

        const videoLessons = allLessons.filter(l => l.videoUrl && l.videoUrl.trim() !== "").map(l => {
            const obj = l.toObject();
            obj.alreadyTaken = checkIfTaken(l._id, l.title);
            return obj;
        });

        const lessonBasedQuizzes = allLessons.filter(l => {
            const hasQuizArray = l.quiz && Array.isArray(l.quiz) && l.quiz.length > 0;
            const noVideo = !l.videoUrl || l.videoUrl.trim() === "";
            return noVideo && hasQuizArray;
        }).map(q => {
            const obj = q.toObject();
            obj.alreadyTaken = checkIfTaken(q._id, q.title);
            return obj;
        });

        const finalStandaloneQuizzes = standaloneQuizzes.map(q => {
            const obj = q.toObject();
            obj.alreadyTaken = checkIfTaken(q._id, q.title);
            return obj;
        });

        res.json({ 
            success: true, 
            lessons: videoLessons, 
            quizzes: [...lessonBasedQuizzes, ...finalStandaloneQuizzes], 
            grade: student.grade,
            isSuspended: false,
            results: student.scores || [] 
        });

    } catch (err) {
        res.status(500).json({ success: false, message: "فشل تحميل المحتوى" });
    }
});

// 3. استقبال وتصحيح الاختبار
router.post('/submit-quiz', async (req, res) => {
    try {
        const { studentId, quizId, answers } = req.body; 
        const student = await User.findById(studentId);
        if (!student) return res.status(404).json({ success: false, message: "الطالب غير موجود" });

        if (student.isSuspended) {
            return res.status(403).json({ success: false, message: "حسابك معلق حالياً ⚠️", isSuspended: true });
        }

        let quizSource = await Lesson.findById(quizId);
        let questions = [];
        let isLessonSource = false;

        if (quizSource && quizSource.quiz && quizSource.quiz.length > 0) {
            questions = quizSource.quiz;
            isLessonSource = true;
        } else {
            quizSource = await Quiz.findById(quizId);
            if (quizSource) {
                questions = quizSource.questions;
                isLessonSource = false;
            }
        }

        if (!quizSource || questions.length === 0) return res.status(404).json({ success: false, message: "بيانات الاختبار غير موجودة" });

        const alreadyDone = student.scores.some(s => (s.quizId && String(s.quizId) === String(quizId)) || (s.lessonId && String(s.lessonId) === String(quizId)));
        if (alreadyDone) return res.status(403).json({ success: false, message: "حليت الاختبار ده قبل كدة ⚠️" });

        let score = 0;
        const studentAnswersToSave = [];
        questions.forEach((q, index) => {
            const studentAns = answers[index] ? String(answers[index]).trim() : "غير مجاب";
            const correctAns = (q.correctAnswer || q.answer) ? String(q.correctAnswer || q.answer).trim() : "";
            studentAnswersToSave.push(studentAns); 
            if (studentAns !== "غير مجاب" && correctAns !== "" && studentAns === correctAns) score++;
        });

        const percentage = ((score / questions.length) * 100).toFixed(1);
        const scoreEntry = {
            quizTitle: quizSource.title,
            score: score,
            total: questions.length,
            percentage: percentage, 
            answers: studentAnswersToSave, 
            date: new Date(),
            quizId: !isLessonSource ? new mongoose.Types.ObjectId(quizId) : null,
            lessonId: isLessonSource ? new mongoose.Types.ObjectId(quizId) : null
        };

        await User.findByIdAndUpdate(studentId, { $push: { scores: scoreEntry } });
        res.json({ success: true, message: "تم حفظ النتيجة بنجاح ✅", score, total: questions.length, percentage });

    } catch (err) {
        res.status(500).json({ success: false, message: "حدث خطأ أثناء تصحيح الاختبار" });
    }
});

// 5. راوت جلب تفاصيل الاختبار للمراجعة
router.get('/quiz-details/:quizId', async (req, res) => {
    try {
        const { quizId } = req.params;
        let quizSource = await Lesson.findById(quizId) || await Quiz.findById(quizId);
        let questions = quizSource?.quiz || quizSource?.questions || [];

        if (!quizSource) return res.status(404).json({ success: false, message: "الاختبار غير موجود" });

        const formattedQuestions = questions.map(q => ({
            question: q.question || q.questionText,
            questionImage: q.questionImage || "",
            correctAnswer: q.correctAnswer || q.answer,
            explanation: q.explanation || ""
        }));

        res.json({ success: true, quiz: { title: quizSource.title, questions: formattedQuestions } });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في جلب بيانات المراجعة" });
    }
});

// 4. راوت إصلاح البيانات القديمة
router.get('/fix-results-ids', async (req, res) => {
    try {
        const users = await User.find({});
        const allQuizzes = await Quiz.find({});
        const allLessons = await Lesson.find({});
        let updatedCount = 0;

        for (let user of users) {
            let changed = false;
            user.scores.forEach(score => {
                if (!score.quizId && !score.lessonId) {
                    const q = allQuizzes.find(item => item.title === score.quizTitle);
                    const l = allLessons.find(item => item.title === score.quizTitle);
                    if (q) { score.quizId = q._id; changed = true; } 
                    else if (l) { score.lessonId = l._id; changed = true; }
                }
            });
            if (changed) { await user.save(); updatedCount++; }
        }
        res.send(`تم إصلاح بيانات ${updatedCount} طالب بنجاح ✅`);
    } catch (err) {
        res.status(500).send("خطأ أثناء الإصلاح: " + err.message);
    }
});

module.exports = router;

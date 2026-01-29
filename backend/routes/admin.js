const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// --- تعديل هام: التأكد من استدعاء الموديلات بأسماء الملفات الصحيحة (حروف سمول) ---
// استدعاء الموديلات (تأكد أن الحروف تطابق أسماء الملفات بالضبط)
const User = require('../models/User'); 
const Lesson = require('../models/Lesson'); 
const Code = require('../models/Code');    
const Quiz = require('../models/Quiz');

// دالة مساعدة مطورة لتوحيد وتنظيف الأسئلة (تم توحيد الحقول لتناسب نظام المراجعة)
const formatQuestions = (quizArray) => {
    if (!quizArray || !Array.isArray(quizArray)) return [];
    return quizArray.map((q, index) => {
        const cleanCorrectAnswer = (q.correctAnswer || q.answer || "").toString().trim();
        
        if (!cleanCorrectAnswer) {
            console.log(`⚠️ تنبيه: السؤال رقم ${index + 1} مضاف بدون إجابة صحيحة!`);
        }

        return {
            question: (q.question || q.questionText || "").toString().trim(), 
            questionImage: (q.questionImage || "").toString().trim(), 
            explanation: (q.explanation || "").toString().trim(),      
            options: (q.options || q.choices || []).map(opt => opt.toString().trim()),
            correctAnswer: cleanCorrectAnswer 
        };
    });
};

// --- 0. جلب المحاضرات بناءً على الشهر والصف ---
router.get('/lessons-by-month', async (req, res) => {
    try {
        const { month, grade } = req.query;
        const lessons = await Lesson.find({ 
            month: month, 
            grade: grade 
        }).select('title branch _id');

        res.json({
            success: true,
            lessons: lessons
        });
    } catch (err) {
        console.error("Error fetching filtered lessons:", err);
        res.status(500).json({ success: false, message: "❌ خطأ في جلب بيانات المحاضرات" });
    }
});

// --- [تعديل جديد] جلب الامتحانات بناءً على الصف (لخدمة قائمة الغياب المنسدلة) ---
router.get('/quizzes-by-grade', async (req, res) => {
    try {
        const { grade } = req.query;
        const standaloneQuizzes = await Quiz.find({ grade }).select('title month _id');
        const lessonsWithQuizzes = await Lesson.find({ 
            grade, 
            quiz: { $exists: true, $not: { $size: 0 } } 
        }).select('title month _id');

        const allQuizzes = [
            ...standaloneQuizzes.map(q => ({ _id: q._id, title: `(شامل) ${q.title}`, month: q.month })),
            ...lessonsWithQuizzes.map(l => ({ _id: l._id, title: `(محاضرة) ${l.title}`, month: l.month }))
        ];

        res.json({ success: true, quizzes: allQuizzes });
    } catch (err) {
        console.error("Error fetching quizzes for absence system:", err);
        res.status(500).json({ success: false, message: "خطأ في جلب بيانات الامتحانات" });
    }
});

// --- 1. إضافة درس جديد ---
router.post('/add-lesson', async (req, res) => {
    try {
        const { title, videoUrl, grade, branch, month, quiz, examDuration } = req.body;
        
        const newLesson = new Lesson({
            title: title.trim(), 
            videoUrl, 
            grade,
            branch, 
            month, 
            quiz: formatQuestions(quiz),
            examDuration: examDuration || 30 
        });
        await newLesson.save();
        res.status(201).json({ success: true, message: "✅ تم إضافة المحاضرة بنجاح" });
    } catch (err) {
        console.error("Error adding lesson:", err);
        res.status(500).json({ success: false, message: "خطأ في إضافة الدرس" });
    }
});

// --- 2. إضافة ملف PDF ---
router.post('/add-pdf', async (req, res) => {
    try {
        const { title, month, lessonId, grade, url } = req.body;

        if (lessonId && lessonId !== "general" && lessonId !== "standalone" && lessonId.length === 24) {
            const updatedLesson = await Lesson.findByIdAndUpdate(
                lessonId, 
                { $set: { pdfUrl: url, pdfTitle: title } }, 
                { new: true }
            );
            if (!updatedLesson) return res.status(404).json({ success: false, message: "الدرس غير موجود" });
            return res.json({ success: true, message: "✅ تم ربط الملف بالدرس بنجاح" });
        }

        const standalonePdf = new Lesson({
            title: title,
            grade: grade,
            month: month,
            pdfUrl: url,
            pdfTitle: title,
            branch: "ملف خارجي",
            videoUrl: "" 
        });
        await standalonePdf.save();

        res.json({ success: true, message: "✅ تم إضافة الملف كملف خارجي بنجاح" });
    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ success: false, message: "حدث خطأ فني أثناء إضافة الملف" });
    }
});

// --- 3. إضافة اختبار (Quiz) ---
router.post('/add-quiz', async (req, res) => {
    try {
        const { lessonId, examDuration, quiz, title, grade, month } = req.body;
        
        if (!title) {
            return res.status(400).json({ success: false, message: "عنوان الاختبار مطلوب" });
        }

        const cleanQuestions = formatQuestions(quiz);

        if (lessonId && lessonId !== "standalone" && lessonId.length === 24) {
            const updatedLesson = await Lesson.findByIdAndUpdate(
                lessonId,
                { 
                    $set: { 
                        quiz: cleanQuestions, 
                        examDuration: examDuration,
                    }
                },
                { new: true }
            );
            if (!updatedLesson) return res.status(404).json({ success: false, message: "المحاضرة غير موجودة" });
            return res.status(200).json({ success: true, message: "✅ تم ربط الأسئلة بالمحاضرة بنجاح" });
        }

        const standaloneQuiz = new Quiz({
            title: title.trim(),
            grade: grade,
            month: month,
            questions: cleanQuestions,
            examDuration: examDuration,
            branch: "اختبار شامل",
            createdAt: new Date()
        });
        await standaloneQuiz.save();

        res.status(200).json({ success: true, message: "✅ تم نشر الاختبار الشامل بنجاح" });
    } catch (err) {
        console.error("Error adding Quiz:", err);
        res.status(500).json({ success: false, message: "❌ فشل حفظ الاختبار: " + err.message });
    }
});

// --- 4. توليد أكواد اشتراك ---
router.post('/generate-codes', async (req, res) => {
    try {
        const { month, grade, count, branch } = req.body; 
        let codesArr = [];
        for (let i = 0; i < parseInt(count); i++) {
            const randomCode = "MRW-" + Math.random().toString(36).substring(2, 9).toUpperCase();
            codesArr.push({ 
                code: randomCode, 
                month, grade,
                branch: branch || "عام",
                isUsed: false 
            });
        }
        await Code.insertMany(codesArr);
        res.status(201).json({ 
            success: true, 
            message: `✅ تم توليد ${count} كود بنجاح`,
            generatedCodes: codesArr.map(c => c.code) 
        });
    } catch (err) {
        console.error("Error generating codes:", err);
        res.status(500).json({ success: false, message: "❌ خطأ في توليد الأكواد" });
    }
});

// --- 5. جلب الإحصائيات ---
router.get('/stats', async (req, res) => {
    try {
        const totalStudents = await User.countDocuments({ role: 'student' });
        const totalLessons = await Lesson.countDocuments();
        const availableCodes = await Code.countDocuments({ isUsed: false });
        const usedCodes = await Code.countDocuments({ isUsed: true });

        res.json({
            success: true,
            totalStudents,
            totalLessons,
            availableCodes,
            usedCodes
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في جلب الإحصائيات" });
    }
});

// --- 6. جلب تقارير ودرجات الطلاب ---
router.get('/students-report', async (req, res) => {
    try {
        const students = await User.find({ role: 'student' })
                                   .select('name phone parentPhone grade scores isSuspended')
                                   .sort({ createdAt: -1 });

        const formattedReport = students.map(student => {
            const studentObj = student.toObject();
            const lastScoreEntry = student.scores && student.scores.length > 0 
                                   ? student.scores[student.scores.length - 1] 
                                   : null;
            
            return {
                ...studentObj,
                lastGrade: lastScoreEntry ? (parseFloat(lastScoreEntry.percentage) || 0) : 0
            };
        });

        res.json(formattedReport); 
    } catch (err) {
        console.error("Students report error:", err);
        res.status(500).json({ success: false, message: "خطأ في جلب تقارير الطلاب" });
    }
});

// --- 7. مسار تعليق / فك تعليق حساب الطالب ---
router.put('/toggle-student-status/:id', async (req, res) => {
    try {
        const { isSuspended } = req.body;
        const studentId = req.params.id;

        const updatedStudent = await User.findByIdAndUpdate(
            studentId,
            { isSuspended: isSuspended },
            { new: true }
        );

        if (!updatedStudent) {
            return res.status(404).json({ success: false, message: "الطالب غير موجود" });
        }

        res.json({ 
            success: true, 
            message: isSuspended ? "تم تعليق الحساب بنجاح 🔒 وسيتم طرده عند المحاولة القادمة" : "تم فك التعليق بنجاح ✅" 
        });
    } catch (err) {
        console.error("Toggle status error:", err);
        res.status(500).json({ success: false, message: "خطأ في تحديث حالة الطالب" });
    }
});


module.exports = router;


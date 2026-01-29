const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// تحميل متغيرات البيئة
dotenv.config();

const app = express();

// --- 1. الإعدادات الأساسية (Middleware) ---
app.use(cors()); 
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// مراقب المسارات للكشف عن الأخطاء (Log)
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// --- [تطوير] برمجية وسيطة للتحقق من التعليق + حماية الجلسة (Single Device) ---
const checkSuspensionAndSession = async (req, res, next) => {
    // نطبق الفحص على مسارات الطلاب فقط
    if (req.url.includes('/api/student/')) {
        const studentId = req.headers['user-id'] || req.body.studentId || req.query.studentId;
        const incomingSessionId = req.headers['session-id'] || req.query.sessionId; // استلام الـ Session من الهيدرز أو الكويري

        if (studentId && mongoose.Types.ObjectId.isValid(studentId)) {
            const User = mongoose.models.User || mongoose.model('User');
            const user = await User.findById(studentId);

            if (user) {
                // 1. فحص التعليق
                if (user.isSuspended) {
                    return res.status(403).json({ 
                        success: false, 
                        isSuspended: true, 
                        message: "عذراً، حسابك معلق حالياً. يرجى التواصل مع الإدارة ⚠️" 
                    });
                }

                // 2. فحص الجلسة (منع تعدد الأجهزة)
                // لو المتصفح باعت SessionId مش زي اللي في الداتا بيز، يبقى فيه جهاز تاني دخل
                if (incomingSessionId && user.currentSessionId && incomingSessionId !== user.currentSessionId) {
                    return res.status(401).json({ 
                        success: false, 
                        kickOut: true, 
                        message: "تم تسجيل الدخول من جهاز آخر، سيتم الخروج تلقائياً ⚠️" 
                    });
                }
            }
        }
    }
    next();
};
app.use(checkSuspensionAndSession);

// --- 2. ربط الملفات الثابتة (Frontend) ---
const publicPath = path.resolve(__dirname, '..', 'public');
app.use(express.static(publicPath));

// تأكد إن المسارات هنا مطابقة لاسم الفولدر الحقيقي
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const studentRoutes = require('./routes/student');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);

/**
 * [نظام الغياب] جلب المحاضرات التي تحتوي على كويزات
 */
app.get('/api/admin/lessons-by-month', async (req, res) => {
    try {
        const { month, grade } = req.query;
        const Lesson = mongoose.models.Lesson || mongoose.model('Lesson'); 
        const lessons = await Lesson.find({ 
            month, 
            grade,
            quiz: { $exists: true, $not: { $size: 0 } } 
        }).select('title branch _id quiz pdfUrl pdfTitle examDuration');
        res.json({ success: true, lessons });
    } catch (error) {
        res.status(500).json({ success: false, message: "حدث خطأ في جلب المحاضرات" });
    }
});

/**
 * جلب جميع الاختبارات لصف معين (شامل + محاضرات)
 */
app.get('/api/admin/all-quizzes-by-grade', async (req, res) => {
    try {
        const { grade } = req.query;
        const Lesson = mongoose.models.Lesson || mongoose.model('Lesson'); 
        const Quiz = mongoose.models.Quiz || mongoose.model('Quiz');
        const [standaloneQuizzes, lessonsWithQuizzes] = await Promise.all([
            Quiz.find({ grade }).select('title month _id'),
            Lesson.find({ grade, quiz: { $exists: true, $not: { $size: 0 } } }).select('title month _id')
        ]);
        const allQuizzes = [
            ...standaloneQuizzes.map(q => ({ _id: q._id, title: `(شامل) ${q.title}`, month: q.month, type: 'standalone' })),
            ...lessonsWithQuizzes.map(l => ({ _id: l._id, title: `(محاضرة) ${l.title}`, month: l.month, type: 'lesson' }))
        ];
        res.json({ success: true, quizzes: allQuizzes });
    } catch (error) {
        res.status(500).json({ success: false, message: "خطأ في جلب قائمة الاختبارات" });
    }
});

// --- 4. توجيه الصفحات ---
app.get('/', (req, res) => { res.sendFile(path.join(publicPath, 'login.html')); });
app.get('/student-dashboard', (req, res) => { res.sendFile(path.join(publicPath, 'student-dashboard.html')); });
app.get('/admin-dashboard', (req, res) => { res.sendFile(path.join(publicPath, 'admin-dashboard.html')); });
app.get('/quiz', (req, res) => { res.sendFile(path.join(publicPath, 'quiz.html')); });

// --- 5. الاتصال بالداتابيز وتنسيق التشغيل ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ تم الاتصال بنجاح بـ MongoDB Atlas');
    const PORT = process.env.PORT || 8000; 
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 السيرفر شغال على بورت: ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ فشل الاتصال بالداتابيز:', err.message);
  });

app.use((req, res) => {
    res.status(404).send("صفحة غير موجودة - Cannot find this route");
});

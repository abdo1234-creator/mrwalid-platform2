const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
    // العنوان الأساسي للحصة
    title: { 
        type: String, 
        required: true, 
        trim: true 
    },
    // رابط الفيديو (يفضل يكون Embed من YouTube أو Drive)
    videoUrl: { 
        type: String, 
        default: "" 
    },
    // المرحلة الدراسية (مثلاً: 1-sec)
    grade: { 
        type: String, 
        required: true 
    },
    // فرع المادة (مثلاً: تفاضل، جبر، استاتيكا)
    branch: { 
        type: String, 
        required: true 
    },
    // الشهر التابع له الدرس
    month: { 
        type: String, 
        required: true 
    },
    // وصف الدرس أو المرفقات (اختياري)
    description: { 
        type: String 
    },

    // [تعديل جوهري] نظام الاختبار المدمج المحدث ليتوافق مع نظام المراجعة
    quiz: [{
        // تم توحيد المسمى ليكون question ليتوافق مع كود المراجعة
        question: { type: String, required: true }, 
        // رابط صورة السؤال (يظهر في المراجعة)
        questionImage: { type: String, default: "" },   
        // تفسير الإجابة (يظهر عند المراجعة أسفل السؤال)
        explanation: { type: String, default: "" },     
        options: [String], 
        // تم توحيد المسمى ليكون correctAnswer ليتطابق مع المقارنة في المراجعة
        correctAnswer: { type: String, required: true } 
    }],

    // مدة الامتحان بالدقائق
    examDuration: { 
        type: Number, 
        default: 30 
    },

    // --- الإضافات الخاصة بالملفات والمرفقات ---
    
    // لتخزين رابط ملف الـ PDF وعنوانه
    pdfUrl: { type: String },
    pdfTitle: { type: String },

    // الرابط المباشر للاختبار الخارجي
    quizLink: { type: String },

    // لتخزين الاختبارات الخارجية
    externalQuizzes: [{
        title: String,
        link: String,
        time: Number,
        month: String,
        createdAt: { type: Date, default: Date.now }
    }]

}, { 
    timestamps: true // يسجل وقت رفع الدرس تلقائياً
});

// تصدير الموديل
module.exports = mongoose.model('Lesson', lessonSchema);

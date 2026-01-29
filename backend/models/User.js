const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true, 
        trim: true 
    },
    phone: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true 
    },
    parentPhone: { 
        type: String, 
        required: true, 
        trim: true 
    },
    password: { 
        type: String, 
        required: true 
    },
    grade: { 
        type: String, 
        required: true,
        enum: [
            '1-prep', '2-prep', '3-prep', 
            '1-sec', '2-sec', '3-sec'
        ]
    }, 
    role: { 
        type: String, 
        default: 'student' 
    },
    isSuspended: { 
        type: Boolean, 
        default: false 
    },
    suspensionReason: {
        type: String,
        default: "تم تعليق حسابك لمخالفة التعليمات، يرجى التواصل مع مستر وليد."
    },
    subscriptions: {
        type: [{
            month: String,
            branch: String,
            expiryDate: Date,
            activatedAt: { type: Date, default: Date.now }
        }],
        default: [] 
    },
    scores: {
        type: [{
            quizTitle: String, 
            quizId: { 
                type: mongoose.Schema.Types.ObjectId, 
                ref: 'Quiz', 
                default: null 
            }, 
            lessonId: { 
                type: mongoose.Schema.Types.ObjectId, 
                ref: 'Lesson', 
                default: null 
            }, 
            score: Number,
            total: Number,
            percentage: String, 
            answers: { 
                type: [String], 
                default: [] 
            }, 
            date: { type: Date, default: Date.now }
        }],
        default: []
    },
    watchTime: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },

    // ==========================================
    // [إضافات نظام حماية التسجيل ومنع تعدد الأجهزة]
    // ==========================================
    currentSessionId: { 
        type: String, 
        default: null 
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    deviceInfo: {
        os: String,      // نظام التشغيل (Android, Windows, etc.)
        browser: String  // المتصفح (Chrome, Safari, etc.)
    }

}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// [إضافة اختيارية] تساعدك في جلب حالة الطالب بكلمة واضحة
userSchema.virtual('statusMessage').get(function() {
    return this.isSuspended ? "هذا الحساب معلق" : "الحساب نشط";
});

// [تحسين الـ Index]
userSchema.index({ isSuspended: 1 });
userSchema.index({ grade: 1, 'scores.quizId': 1 });
// [إضافة] فهرس للـ Session ID لسرعة التحقق في كل Request
userSchema.index({ currentSessionId: 1 }); 

module.exports = mongoose.model('User', userSchema);

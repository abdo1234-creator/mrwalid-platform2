const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: true,
        trim: true 
    },
    questions: [
        {
            question: {
                type: String,
                trim: true 
            },
            questionImage: { 
                type: String, 
                default: "",
                trim: true 
            },
            explanation: { 
                type: String, 
                default: "",
                trim: true 
            },
            options: [{ 
                type: String, 
                trim: true 
            }],
            correctAnswer: {
                type: String,
                trim: true 
            }
        }
    ],
    examDuration: { 
        type: Number, 
        default: 30 
    },
    grade: { 
        type: String, 
        required: true // تم التأكيد عليه لأنه أساس عملية فلترة الغياب
    },
    month: { 
        type: String, 
        required: true 
    },
    // تم الإبقاء عليه لربط الاختبار بدرس معين، وهو المستخدم في كود الغياب (s.lessonId)
    lessonId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Lesson',
        default: null 
    },
    branch: {
        type: String,
        default: "عام"
    },
    isComprehensive: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // [إضافة بسيطة] حقل لتخزين عدد الطلاب الذين أدوا الامتحان (اختياري لتحسين الأداء)
    attemptedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

// إضافة index لتحسين سرعة البحث عند فلترة الغياب حسب الصف والمجال
quizSchema.index({ grade: 1, month: 1 });

module.exports = mongoose.model('Quiz', quizSchema);
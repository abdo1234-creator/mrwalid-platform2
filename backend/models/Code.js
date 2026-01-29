const mongoose = require('mongoose');

const codeSchema = new mongoose.Schema({
    // الكود نفسه (مثلاً: MRW-X5Y6Z7)
    code: { type: String, unique: true, required: true },
    
    // التعديل: خليناه String عشان يقبل "أكتوبر" و "نوفمبر" بدل الأرقام
    month: { type: String, required: true },
    
    // الصف الدراسي (مثلاً: 1-sec)
    grade: { type: String, required: true },
    
    // فرع المادة (مثلاً: جبر، تفاضل، أو اشتراك شهري)
    branch: { type: String, required: true, default: 'عام' }, 
    
    // حالة الكود
    isUsed: { type: Boolean, default: false },
    
    // ربط الكود بالطالب اللي استخدمه
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    
    // تاريخ التفعيل
    usedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Code', codeSchema);

const express = require('express');
const router = express.Router();
const User = require('../models/User'); 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // [إضافة] لتوليد Session ID فريد

// 1. تسجيل جديد
router.post('/register', async (req, res) => {
    try {
        const { name, phone, parentPhone, password, grade, role } = req.body;

        let user = await User.findOne({ phone });
        if (user) return res.status(400).json({ success: false, message: "رقم الهاتف مسجل بالفعل" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = new User({
            name,
            phone,
            parentPhone,
            password: hashedPassword,
            grade,
            role: role || 'student'
        });

        await user.save();

        const token = jwt.sign(
            { id: user._id, role: user.role }, 
            process.env.JWT_SECRET || 'fallback_secret', 
            { expiresIn: '7d' }
        );

        res.status(201).json({ 
            success: true, 
            message: "✅ تم إنشاء الحساب بنجاح",
            token,
            role: user.role,
            userName: user.name,
            userId: user._id,
            isSuspended: user.isSuspended || false 
        });

    } catch (err) {
        console.error("❌ Register Error:", err);
        res.status(500).json({ success: false, message: "خطأ في السيرفر أثناء التسجيل" });
    }
});

// 2. تسجيل الدخول (Login) مع حماية الـ Session
router.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        const user = await User.findOne({ phone });
        if (!user) return res.status(400).json({ success: false, message: "بيانات الدخول غير صحيحة" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "بيانات الدخول غير صحيحة" });

        // [فحص التعليق]
        if (user.isSuspended) {
            return res.status(403).json({
                success: false,
                isSuspended: true,
                message: "حسابك اتقفل. تواصل مع بشمهندس عبدالرحمن لتفعيله⚠️"
            });
        }

        // ==================================================
        // [نظام حماية التسجيل - الحماية من تعدد الأجهزة]
        // ==================================================
        
        // 1. توليد معرف جلسة جديد تماماً عند كل عملية دخول
        const newSessionId = crypto.randomBytes(16).toString('hex');
        
        // 2. تحديث الداتا بيز بـ الـ Session الجديدة ومعلومات الدخول
        user.currentSessionId = newSessionId;
        user.lastLogin = new Date();
        
        // [اختياري] لو حابب تسجل الجهاز من الـ Headers
        user.deviceInfo = {
            browser: req.headers['user-agent']?.split(' ')[0] || 'Unknown',
            os: req.headers['user-agent']?.split('(')[1]?.split(')')[0] || 'Unknown'
        };

        await user.save(); // حفظ الـ sessionId الجديد

        const token = jwt.sign(
            { id: user._id, role: user.role, sessionId: newSessionId }, // ضفنا الـ sessionId جوه الـ Token للأمان
            process.env.JWT_SECRET || 'fallback_secret', 
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            role: user.role,
            userName: user.name,
            userId: user._id,
            grade: user.grade,
            currentSessionId: newSessionId, // [مهم] نبعته للفرونت إند عشان يخزنه ويقارن بيه
            user: {
                isSuspended: user.isSuspended || false
            }
        });

    } catch (err) {
        console.log("❌ Login Error Details:", err); 
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
});

module.exports = router;

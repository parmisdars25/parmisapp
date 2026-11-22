// ==================== اتصال ماژولار به دیتابیس (بدون کدهای اتصال در فایل بازی) ====================
import {
    getSupabaseSync,
    ensureSupabaseReady,
    patchUserKeepalive
} from './db.js';

let sb = getSupabaseSync();
let gameFallbackSyncTimer = null;

async function getDb() {
    if (!sb) sb = await ensureSupabaseReady();
    return sb;
}

// ==================== ایزوله‌سازی DOM و پاکسازی المان‌های خارجی ====================
const allowedRootIds = new Set(['confettiCanvas', 'countdownOverlay', 'gameAppContainer', 'roundResultModal', 'matchWinnerModal']);
function cleanExternalNodes() {
    document.querySelectorAll('a[href*="netlify"], iframe[src*="netlify"], [id*="netlify"], [class*="netlify"], div[data-netlify-deploy-drawer]').forEach(el => {
        el.style.setProperty('display', 'none', 'important');
        el.remove();
    });
    Array.from(document.body.children).forEach(child => {
        const tag = child.tagName.toLowerCase();
        if (tag !== 'script' && tag !== 'style' && tag !== 'link' && !allowedRootIds.has(child.id)) {
            child.style.setProperty('display', 'none', 'important');
            child.remove();
        }
    });
}
cleanExternalNodes();
const domObserver = new MutationObserver(() => cleanExternalNodes());
window.addEventListener('DOMContentLoaded', () => {
    cleanExternalNodes();
    domObserver.observe(document.body, { childList: true, subtree: true });
});

// ==================== تنظیم هوشمند ابعاد صفحه و کیبورد موبایل ====================
function syncGameViewport() {
    const vv = window.visualViewport;
    if (vv && window.innerWidth <= 500) {
        if (window.scrollY !== 0 || window.scrollX !== 0) {
            window.scrollTo(0, 0);
        }
        document.documentElement.style.setProperty('--vv-height', `${vv.height}px`);
        document.documentElement.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    } else {
        document.documentElement.style.setProperty('--vv-height', '100dvh');
        document.documentElement.style.setProperty('--vv-top', '0px');
    }
    requestAnimationFrame(() => resizeDrawingCanvas());
}

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncGameViewport);
    window.visualViewport.addEventListener('scroll', syncGameViewport);
}
window.addEventListener('resize', syncGameViewport);

// ==================== تشخیص کاربر فعلی و پارتنر ====================
let currentUser = localStorage.getItem('chatUsername');
if (!currentUser || (currentUser !== 'مهدی' && currentUser !== 'پارمیس')) {
    window.location.href = 'index.html';
}
const partnerName = (currentUser === 'مهدی') ? 'پارمیس' : 'مهدی';

const defaultAvatarSVG = "data:image/svg+xml;utf8," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
            <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#e0e7ff"/>
                <stop offset="100%" stop-color="#fbcfe8"/>
            </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#g)"/>
        <circle cx="50" cy="38" r="18" fill="#4f46e5"/>
        <path d="M22 86 C22 65 78 65 78 86" fill="#4f46e5"/>
    </svg>
`);

// ==================== بانک جامع ۷۰۴ کلمه فارسی برای نقاشی ====================
const WORD_BANK = ["چتر", "عینک", "ساعت مچی", "کلید", "قفل", "قیچی", "چکش", "پیچ گوشتی", "اره", "نردبان", "جاروبرقی", "اتو", "سشوار", "مسواک", "خمیردندان", "صابون", "شانه", "آینه", "شمع", "کبریت", "فندک", "چراغ قوه", "لامپ", "پنکه", "کولر", "بخاری", "تلویزیون", "کنترل", "تلفن", "موبایل", "هدفون", "میکروفون", "دوربین", "لپ تاپ", "کیبورد", "موس", "فلش", "ساعت دیواری", "زنگوله", "سوت", "ذره بین", "تلسکوپ", "میکروسکوپ", "قطب نما", "ترازو", "دمبل", "طناب", "توپ", "راکت", "تور", "چادر", "کیسه خواب", "کوله پشتی", "چمدان", "کیف پول", "چرخ خیاطی", "سوزن", "نخ", "دکمه", "زیپ", "سنجاق", "گیره لباس", "سطل زباله", "جارو", "طی", "اسفنج", "شیر آب", "دوش حمام", "وان حمام", "توالت", "تخت خواب", "بالش", "پتو", "تشک", "مبل", "صندلی", "میز", "کتابخانه", "کمد", "فرش", "پرده", "لوستر", "آباژور", "قاب عکس", "گلدان", "ساعت شنی", "تقویم", "دفتر", "کتاب", "مداد", "خودکار", "پاک کن", "تراش", "خط کش", "پرگار", "گچ", "تخته سیاه", "قلم مو", "بوم نقاشی", "پالت رنگ", "چسب", "منگنه", "پوشه", "پاکت نامه", "تمبر", "جعبه کادو", "بادکنک", "فشفشه", "برف شادی", "ماسک", "چسب زخم", "سرنگ", "قرص", "شربت", "دماسنج", "ویلچر", "عصا", "باند", "گوشی پزشکی", "آمبولانس", "قاشق", "چنگال", "چاقو", "بشقاب", "لیوان", "فنجان", "نعلبکی", "قوری", "کتری", "سماور", "ماهیتابه", "قابلمه", "زودپز", "آبکش", "رنده", "تخته گوشت", "وردنه", "همزن", "مخلوط کن", "چرخ گوشت", "توستر", "مایکروفر", "یخچال", "فریزر", "اجاق گاز", "فر", "هود", "سینک ظرفشویی", "ماشین لباسشویی", "ظرفشویی", "فلاسک", "قمقمه", "بطری", "پارچ", "نمکدان", "شکردان", "سینی", "سفره", "دستمال کاغذی", "پیش بند", "دستکش فر", "نی", "چوب پنبه", "در بازکن", "ساطور", "سیخ کباب", "منقل", "بادبزن", "قندشکن", "هاون", "سیب", "موز", "پرتقال", "نارنگی", "لیمو", "هندوانه", "خربزه", "طالبی", "توت فرنگی", "گیلاس", "آلبالو", "انگور", "هلو", "شلیل", "زردآلو", "آلو", "گلابی", "به", "انار", "انجیر", "کیوی", "آناناس", "انبه", "نارگیل", "آووکادو", "خرما", "زیتون", "خیار", "گوجه فرنگی", "سیب زمینی", "پیاز", "سیر", "هویج", "کاهو", "کلم", "کلم بروکلی", "گل کلم", "اسفناج", "جعفری", "نعناع", "فلفل دلمه", "فلفل تند", "بادمجان", "کدو", "ذرت", "بلال", "نخود فرنگی", "لوبیا", "عدس", "قارچ", "تربچه", "چغندر", "شلغم", "کرفس", "پیتزا", "همبرگر", "هات داگ", "ساندویچ", "سیب زمینی سرخ کرده", "مرغ سوخاری", "کباب", "جوجه کباب", "قرمه سبزی", "قیمه", "فسنجان", "آش رشته", "سوپ", "املت", "نیمرو", "تخم مرغ", "ماکارونی", "پاستا", "لازانیا", "سوشی", "تاکو", "سمبوسه", "فلافل", "پاپ کورن", "چوب شور", "چیپس", "پفک", "بستنی", "بستنی قیفی", "بستنی چوبی", "کیک تولد", "کاپ کیک", "پیراشکی", "دونات", "وافل", "پنکیک", "شکلات", "آبنبات", "آبنبات چوبی", "آدامس", "ژله", "پشمک", "لواشک", "آجیل", "پسته", "بادام", "گردو", "فندق", "تخمه", "کشمش", "نان سنگک", "نان بربری", "نان تست", "کره", "پنیر", "شیر", "ماست", "عسل", "مربا", "چای", "قهوه", "نسکافه", "آبمیوه", "نوشابه", "دوغ", "قند", "گربه", "سگ", "خرگوش", "همستر", "موش", "اسب", "الاغ", "گاو", "گوسفند", "بز", "شتر", "ببر", "پلنگ", "یوزپلنگ", "گرگ", "روباه", "خرس", "پاندا", "خرس قطبی", "فیل", "زرافه", "کرگدن", "اسب آبی", "گورخر", "کانگورو", "کوالا", "میمون", "گوریل", "سنجاب", "جوجه تیغی", "خارپشت", "خفاش", "راکون", "آهو", "گوزن", "شترمرغ", "پنگوئن", "طاووس", "فلامینگو", "اردک", "غاز", "قو", "مرغ", "خروس", "جوجه", "بوقلمون", "کبوتر", "گنجشک", "کلاغ", "عقاب", "شاهین", "جغد", "طوطی", "قناری", "دارکوب", "لک لک", "پروانه", "زنبور", "کفشدوزک", "مورچه", "عنکبوت", "ملخ", "سنجاقک", "مگس", "پشه", "سوسک", "حلزون", "کرم", "مار", "مارمولک", "آفتاب پرست", "تمساح", "لاک پشت", "قورباغه", "ماهی", "ماهی قرمز", "کوسه", "نهنگ", "دلفین", "اختاپوس", "ستاره دریایی", "اسب دریایی", "عروس دریایی", "خرچنگ", "میگو", "صدف", "فک", "دایناسور", "اژدها", "خورشید", "ماه", "ستاره", "ابر", "باران", "برف", "رعد و برق", "رنگین کمان", "گردباد", "باد", "آسمان", "کهکشان", "سیاره", "زحل", "کره زمین", "فضانورد", "موشک", "سفینه فضایی", "بشقاب پرنده", "شهاب سنگ", "کوه", "آتشفشان", "تپه", "دره", "غار", "بیابان", "کویر", "جنگل", "درخت", "نخل", "کاج", "برگ", "شاخه", "ریشه", "تنه درخت", "گل", "گل رز", "گل آفتابگردان", "لاله", "کاکتوس", "چمن", "علف", "دریا", "اقیانوس", "موج", "ساحل", "جزیره", "رودخانه", "آبشار", "دریاچه", "مرداب", "چشمه", "چاه", "پل", "تونل", "جاده", "خیابان", "چراغ راهنمایی", "تابلو", "نیمکت", "پارک", "شهربازی", "چرخ و فلک", "سرسره", "تاب", "الاکلنگ", "خانه", "آپارتمان", "ویلا", "کلبه", "کاخ", "قلعه", "برج", "برج ایفل", "برج میلاد", "اهرام مصر", "دیوار چین", "مجسمه آزادی", "فانوس دریایی", "آسیاب بادی", "مدرسه", "دانشگاه", "بیمارستان", "داروخانه", "آتش نشانی", "پلیس", "بانک", "رستوران", "کافه", "سینما", "فرودگاه", "ایستگاه قطار", "بندر", "ورزشگاه", "استخر", "باغ وحش", "موزه", "مسجد", "کتابفروشی", "نانوایی", "چشم", "ابرو", "مژه", "بینی", "گوش", "دهان", "لب", "زبان", "دندان", "مو", "ریش", "سبیل", "دست", "انگشت", "ناخن", "پا", "زانو", "قلب", "مغز", "اسکلت", "جمجمه", "استخوان", "ماهیچه", "پیراهن", "تی شرت", "شلوار", "شلوارک", "دامن", "لباس عروس", "کت و شلوار", "پالتو", "کاپشن", "بارانی", "ژاکت", "هودی", "شال گردن", "روسری", "کلاه", "کلاه کپ", "کلاه ایمنی", "تاج", "دستکش", "جوراب", "کفش", "کفش پاشنه بلند", "کتانی", "چکمه", "دمپایی", "صندل", "کمربند", "کراوات", "پاپیون", "انگشتر", "گردنبند", "دستبند", "گوشواره", "ساعت", "عینک آفتابی", "کیف دستی", "ماشین", "تاکسی", "اتوبوس", "مینی بوس", "کامیون", "وانت", "تراکتور", "جرثقیل", "بلدوزر", "ماشین آتش نشانی", "ماشین پلیس", "موتورسیکلت", "دوچرخه", "سه چرخه", "اسکوتر", "اسکیت", "اسکیت بورد", "قطار", "مترو", "تراموا", "تله کابین", "هواپیما", "هلیکوپتر", "جت", "بالن", "چتر نجات", "کشتی", "قایق", "قایق بادبانی", "زیردریایی", "جت اسکی", "موج سواری", "فوتبال", "بسکتبال", "والیبال", "تنیس", "پینگ پنگ", "بدمینتون", "بولینگ", "بیلیارد", "گلف", "بوکس", "کاراته", "وزنه برداری", "تیروکمان", "شمشیربازی", "اسکی", "شنا", "غواصی", "ماهیگیری", "شطرنج", "تخته نرد", "پازل", "تاس", "ورق", "گیتار", "پیانو", "ویولن", "سنتور", "تنبک", "دف", "طبل", "ترومپت", "فلوت", "ساز دهنی", "آدم برفی", "مترسک", "عروسک", "ربات", "بادبادک", "فرفره", "یویو", "تفنگ آبپاش", "حباب ساز", "نقشه گنج", "صندوق گنج", "شمشیر", "سپر", "کمان", "پزشک", "پرستار", "دندانپزشک", "آتش نشان", "خلبان", "ملوان", "آشپز", "نانوا", "نقاش", "عکاس", "خواننده", "نوازنده", "معلم", "دانش آموز", "مهندس", "بنا", "باغبان", "کشاورز", "راننده", "پستچی", "داور", "فوتبالیست", "غواص", "کوهنورد", "جادوگر", "شعبده باز", "دلقک", "دزد دریایی", "پادشاه", "ملکه", "پرنسس", "شوالیه", "نینجا", "قهرمان", "فرشته", "پری دریایی", "غول", "روح", "خون آشام", "مومیایی", "آدم فضایی", "کارآگاه", "نوزاد", "پیرمرد", "عروس و داماد", "تولد", "عروسی", "سفر", "خواب", "کابوس", "رویا", "عشق", "بوسه", "آغوش", "خنده", "گریه", "عصبانیت", "تعجب", "ترس", "سرماخوردگی", "عطسه", "تب", "سردرد", "دنداندرد", "شکستگی", "برنده", "مدال طلا", "جام قهرمانی", "آتش", "دود", "یخ", "آهنربا", "برق", "باتری", "پریز", "سیم", "آنتن", "وای فای", "سایه", "ردپا", "اثر انگشت", "امضا", "قلب تیرخورده", "نامه عاشقانه", "دسته گل", "شامپاین", "آتش بازی"];

// ==================== افکت‌های صوتی داخلی (Web Audio Synthesizer) ====================
let audioCtx = null;
function playGameTone(type) {
    try {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            audioCtx = new AudioContextClass();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;

        if (type === 'correct') {
            const notes = [523.25, 659.25, 783.99, 1046.5];
            notes.forEach((freq, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + idx * 0.09);
                gain.gain.setValueAtTime(0.18, now + idx * 0.09);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.28);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + idx * 0.09);
                osc.stop(now + idx * 0.09 + 0.3);
            });
        } else if (type === 'win') {
            const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
            notes.forEach((freq, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.11);
                gain.gain.setValueAtTime(0.22, now + idx * 0.11);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.35);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + idx * 0.11);
                osc.stop(now + idx * 0.11 + 0.36);
            });
        } else if (type === 'timeout') {
            const notes = [380, 290];
            notes.forEach((freq, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, now + idx * 0.18);
                gain.gain.setValueAtTime(0.12, now + idx * 0.18);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.25);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + idx * 0.18);
                osc.stop(now + idx * 0.18 + 0.26);
            });
        } else if (type === 'guess') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(640, now + 0.08);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.11);
        } else if (type === 'tick') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.07);
        }
    } catch (e) {}
}

// ==================== موتور کاغذ رنگی (Confetti Engine) ====================
const confettiCanvas = document.getElementById('confettiCanvas');
const confettiCtx = confettiCanvas ? confettiCanvas.getContext('2d') : null;
let confettiParticles = [];
let confettiAnimId = null;

function launchConfetti(durationMs = 2800) {
    if (!confettiCanvas || !confettiCtx) return;
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
    const colors = ['#4f46e5', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#a855f7', '#ef4444'];
    for (let i = 0; i < 95; i++) {
        confettiParticles.push({
            x: Math.random() * confettiCanvas.width,
            y: -20 - Math.random() * 120,
            w: 7 + Math.random() * 6,
            h: 10 + Math.random() * 8,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: (Math.random() - 0.5) * 5,
            vy: 3 + Math.random() * 5.5,
            rot: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 0.2
        });
    }
    const stopTime = Date.now() + durationMs;
    if (confettiAnimId) cancelAnimationFrame(confettiAnimId);

    function step() {
        confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
        confettiParticles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.vRot;
            confettiCtx.save();
            confettiCtx.translate(p.x, p.y);
            confettiCtx.rotate(p.rot);
            confettiCtx.fillStyle = p.color;
            confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            confettiCtx.restore();
        });
        confettiParticles = confettiParticles.filter(p => p.y < confettiCanvas.height + 40);
        if (confettiParticles.length > 0 && Date.now() < stopTime + 1500) {
            confettiAnimId = requestAnimationFrame(step);
        } else {
            confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
            confettiParticles = [];
            confettiAnimId = null;
        }
    }
    step();
}

// ==================== متغیرهای وضعیت بازی و کانال زنده Supabase ====================
let selectedTargetPoints = 30;
let selectedRoundSeconds = 120;
let currentRoomState = null;

// آیا بازیکن در این نشست وارد زمین بازی شده است؟
let isInsideArenaSession = false;

let brushColor = '#0f172a';
let brushSize = 6;
let isEraserMode = false;

let isDrawing = false;
let strokesList = [];
let activeStroke = null;
let lastBroadcastTime = 0;
let pendingBroadcastTimer = null;
let lastDbCanvasSyncTime = 0;
let pendingDbCanvasTimer = null;

let gameRealtimeChannel = null;
let isChannelSubscribed = false;

let roundTimerInterval = null;
let lastTickSecond = -1;
let lastRenderedGuessCount = 0;
let lastHandledCelebrationKey = null;
let timeoutTriggeredForRoundId = null;
let autoNextTriggeredForRoundId = null;
let isAdvancingRound = false;
let isStartingCountdown = false;
let recordedWinMatchId = localStorage.getItem('lastRecordedWinMatchId') || '';

const drawingCanvas = document.getElementById('drawingCanvas');
const ctx = drawingCanvas ? drawingCanvas.getContext('2d') : null;

// ==================== توابع کمکی ارتباط با Supabase ====================
const DEFAULT_ROOM_STATE = {
    status: 'lobby',
    readyMahdi: false,
    readyParmis: false,
    targetPoints: 30,
    roundDuration: 120,
    scoreMahdi: 0,
    scoreParmis: 0,
    guesses: []
};

async function fetchLatestRoomState() {
    await getDb();
    const { data, error } = await sb
        .from('game_rooms')
        .select('state')
        .eq('id', 'drawRoom')
        .maybeSingle();
    if (error) throw error;
    return (data && data.state && typeof data.state === 'object') ? data.state : { ...DEFAULT_ROOM_STATE };
}

async function mergeRoomState(partialUpdates) {
    const latest = await fetchLatestRoomState();
    const merged = { ...latest, ...partialUpdates };
    const { error } = await sb
        .from('game_rooms')
        .upsert({
            id: 'drawRoom',
            state: merged,
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
    if (error) throw error;
    handleIncomingRoomState(merged);
    return merged;
}

async function replaceRoomState(fullState) {
    await getDb();
    const { error } = await sb
        .from('game_rooms')
        .upsert({
            id: 'drawRoom',
            state: fullState,
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
    if (error) throw error;
    handleIncomingRoomState(fullState);
    return fullState;
}

async function saveCanvasStateToDb(roundId, strokes) {
    await getDb();
    const payload = {
        roundId: roundId || 'default',
        strokes: Array.isArray(strokes) ? strokes.slice(-85) : [],
        updatedBy: currentUser,
        updatedAt: Date.now()
    };
    const { error } = await sb
        .from('game_rooms')
        .upsert({
            id: 'drawCanvas',
            state: payload,
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
    if (error) throw error;
}

function broadcastCanvasLive(roundId, strokes) {
    if (!gameRealtimeChannel || !isChannelSubscribed) return;
    gameRealtimeChannel.send({
        type: 'broadcast',
        event: 'canvas_strokes',
        payload: {
            roundId: roundId || 'default',
            strokes: Array.isArray(strokes) ? strokes.slice(-85) : [],
            updatedBy: currentUser,
            updatedAt: Date.now()
        }
    }).catch(() => {});
}

// ==================== توابع کمکی متن و کلمات ====================
function normalizePersianWord(str) {
    if (!str) return '';
    return str
        .trim()
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/ة/g, 'ه')
        .replace(/ؤ/g, 'و')
        .replace(/إ|أ|آ/g, 'ا')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, '')
        .toLowerCase();
}

function getEditDistance(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 99;
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[a.length][b.length];
}

function pickRandomWord(usedWords = []) {
    const usedSet = new Set(usedWords);
    const available = WORD_BANK.filter(w => !usedSet.has(w));
    const pool = available.length > 0 ? available : WORD_BANK;
    return pool[Math.floor(Math.random() * pool.length)];
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

// ==================== مدیریت اتاق انتظار و سیستم آمادگی دوطرفه (Ready System) ====================
window.goBackHome = async function() {
    await cancelMyReadyOnExit();
    await setGamePresence(false);
    window.location.href = 'index.html';
};

async function cancelMyReadyOnExit() {
    if (!currentUser) return;
    const myReadyField = (currentUser === 'مهدی') ? 'readyMahdi' : 'readyParmis';
    try {
        if (currentRoomState && currentRoomState.status === 'lobby' && currentRoomState[myReadyField]) {
            await mergeRoomState({ [myReadyField]: false });
        }
    } catch (e) {}
}

window.selectTargetPoints = async function(points) {
    selectedTargetPoints = Number(points);
    updateSettingsPillsUI(selectedTargetPoints, selectedRoundSeconds);
    if (navigator.vibrate) navigator.vibrate(15);
    try {
        await mergeRoomState({ targetPoints: selectedTargetPoints });
    } catch (e) {}
};

window.selectRoundTime = async function(seconds) {
    selectedRoundSeconds = Number(seconds);
    updateSettingsPillsUI(selectedTargetPoints, selectedRoundSeconds);
    if (navigator.vibrate) navigator.vibrate(15);
    try {
        await mergeRoomState({ roundDuration: selectedRoundSeconds });
    } catch (e) {}
};

function updateSettingsPillsUI(targetPts, roundSecs) {
    document.querySelectorAll('#targetPointsGroup .option-pill').forEach(btn => {
        btn.classList.toggle('active', Number(btn.dataset.points) === Number(targetPts));
    });
    document.querySelectorAll('#roundTimeGroup .option-pill').forEach(btn => {
        btn.classList.toggle('active', Number(btn.dataset.seconds) === Number(roundSecs));
    });
}

// دکمه آماده‌ام (Ready) برای شروع هماهنگ بازی
window.toggleMyReadyState = async function() {
    const btn = document.getElementById('toggleReadyBtn');
    if (btn) btn.disabled = true;

    try {
        const latest = await fetchLatestRoomState();
        const myReadyField = (currentUser === 'مهدی') ? 'readyMahdi' : 'readyParmis';
        const nextReady = !Boolean(latest[myReadyField]);

        if (navigator.vibrate) navigator.vibrate(25);

        const updates = {
            [myReadyField]: nextReady,
            targetPoints: selectedTargetPoints,
            roundDuration: selectedRoundSeconds
        };
        if (!latest.status || latest.status === 'match_winner') {
            updates.status = 'lobby';
        }

        await mergeRoomState(updates);
    } catch (err) {
        console.error(err);
        alert("خطا در ثبت وضعیت آمادگی! اینترنتت رو بررسی کن.");
    } finally {
        if (btn) btn.disabled = false;
    }
};

// ورود به بازیِ در حال اجرا (وقتی صفحه رفرش شده باشد)
window.resumeExistingMatch = function() {
    if (!currentRoomState) return;
    isInsideArenaSession = true;
    switchToArenaView();
    renderRoomUI(currentRoomState);
};

// بستن و اتمام کامل بازی نصفه‌کاره در هر لحظه
window.endCurrentMatch = async function() {
    if (!confirm("می‌خوای این بازی رو کلاً ببندی و هر دو نفر برگردید به اتاق انتظار؟")) return;
    try {
        isInsideArenaSession = false;
        strokesList = [];
        clearLocalCanvasGraphics();
        const endedId = 'ended_' + Date.now();
        broadcastCanvasLive(endedId, []);
        await saveCanvasStateToDb(endedId, []);
        await mergeRoomState({
            status: 'lobby',
            readyMahdi: false,
            readyParmis: false,
            targetPoints: selectedTargetPoints,
            roundDuration: selectedRoundSeconds,
            guesses: [],
            lastRoundResult: null,
            matchWinner: null
        });
        switchToLobbyView();
    } catch (e) {
        console.error(e);
        switchToLobbyView();
    }
};

// آغاز بازی جدید پس از Ready شدن هر دو بازیکن
async function initiateNewMatchFromReady() {
    const firstWord = pickRandomWord([]);
    const nowMs = Date.now();
    const roundId = 'rnd_' + nowMs;
    const matchId = 'match_' + nowMs;
    const duration = (currentRoomState && currentRoomState.roundDuration) ? Number(currentRoomState.roundDuration) : selectedRoundSeconds;
    const targetPts = (currentRoomState && currentRoomState.targetPoints) ? Number(currentRoomState.targetPoints) : selectedTargetPoints;

    strokesList = [];
    clearLocalCanvasGraphics();

    broadcastCanvasLive(roundId, []);
    await saveCanvasStateToDb(roundId, []);

    await replaceRoomState({
        matchId: matchId,
        status: 'playing',
        readyMahdi: false,
        readyParmis: false,
        targetPoints: targetPts,
        roundDuration: duration,
        roundNumber: 1,
        roundId: roundId,
        drawer: 'مهدی',
        guesser: 'پارمیس',
        secretWord: firstWord,
        usedWords: [firstWord],
        revealedIndices: [],
        wordChangesLeft: 2,
        roundStartTime: nowMs,
        roundDeadline: nowMs + (duration * 1000),
        autoNextDeadline: null,
        scoreMahdi: 0,
        scoreParmis: 0,
        guesses: [],
        lastRoundResult: null,
        matchWinner: null
    });
}

// نمایش شمارش معکوس ۳..۲..۱ هنگام Ready شدن هر دو نفر
function runReadyCountdownOverlay() {
    if (isStartingCountdown) return;
    isStartingCountdown = true;

    const overlay = document.getElementById('countdownOverlay');
    const numEl = document.getElementById('countdownNumber');
    if (overlay) overlay.classList.add('active');

    let count = 3;
    if (numEl) numEl.textContent = count;
    playGameTone('tick');

    const interval = setInterval(async () => {
        count--;
        if (count > 0) {
            if (numEl) numEl.textContent = count;
            playGameTone('tick');
        } else {
            clearInterval(interval);
            if (numEl) numEl.textContent = 'شروع! 🎨';
            playGameTone('correct');
            isInsideArenaSession = true;

            if (currentUser === 'مهدی') {
                try {
                    await initiateNewMatchFromReady();
                } catch (e) {
                    console.error(e);
                }
            } else {
                // پشتیبان: اگر به هر دلیل مهدی راند اول را نساخت، پارمیس پس از ۸۰۰ میلی‌ثانیه آن را می‌سازد
                setTimeout(async () => {
                    if (!currentRoomState || currentRoomState.status !== 'playing') {
                        try {
                            const fresh = await fetchLatestRoomState();
                            if (fresh.status !== 'playing') {
                                await initiateNewMatchFromReady();
                            } else {
                                handleIncomingRoomState(fresh);
                            }
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }, 800);
            }

            setTimeout(() => {
                if (overlay) overlay.classList.remove('active');
                isStartingCountdown = false;
            }, 500);
        }
    }, 950);
}

function switchToArenaView() {
    document.getElementById('lobbyView').style.display = 'none';
    document.getElementById('gameArenaView').style.display = 'flex';
    document.getElementById('headerScoreboard').style.display = 'flex';
    document.getElementById('headerEndMatchBtn').style.display = 'inline-flex';
    setTimeout(() => {
        resizeDrawingCanvas();
        redrawAllStrokes();
    }, 50);
}

function switchToLobbyView() {
    isInsideArenaSession = false;
    document.getElementById('roundResultModal').classList.remove('active');
    document.getElementById('matchWinnerModal').classList.remove('active');
    document.getElementById('countdownOverlay')?.classList.remove('active');
    document.getElementById('gameArenaView').style.display = 'none';
    document.getElementById('headerScoreboard').style.display = 'none';
    document.getElementById('headerEndMatchBtn').style.display = 'none';
    document.getElementById('lobbyView').style.display = 'flex';
}

// ==================== موتور بوم نقاشی زنده (Realtime Broadcast + DB Persistence) ====================
function resizeDrawingCanvas() {
    if (!drawingCanvas || !ctx) return;
    const wrapper = document.getElementById('canvasStageWrapper');
    if (!wrapper || wrapper.clientWidth === 0 || wrapper.clientHeight === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayW = wrapper.clientWidth;
    const displayH = wrapper.clientHeight;

    if (drawingCanvas.width !== Math.floor(displayW * dpr) || drawingCanvas.height !== Math.floor(displayH * dpr)) {
        drawingCanvas.width = Math.floor(displayW * dpr);
        drawingCanvas.height = Math.floor(displayH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        redrawAllStrokes();
    }
}

function clearLocalCanvasGraphics() {
    if (!drawingCanvas || !ctx) return;
    const wrapper = document.getElementById('canvasStageWrapper');
    const w = wrapper ? wrapper.clientWidth : drawingCanvas.width;
    const h = wrapper ? wrapper.clientHeight : drawingCanvas.height;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w + 20, h + 20);
}

function drawSingleStroke(stroke, w, h) {
    if (!stroke || !Array.isArray(stroke.points) || stroke.points.length === 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = stroke.color || '#0f172a';
    ctx.lineWidth = stroke.size || 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const pts = stroke.points;
    if (pts.length === 1) {
        const x = pts[0].x * w;
        const y = pts[0].y * h;
        ctx.fillStyle = stroke.color || '#0f172a';
        ctx.arc(x, y, (stroke.size || 6) / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
    }

    ctx.moveTo(pts[0].x * w, pts[0].y * h);
    for (let i = 1; i < pts.length - 1; i++) {
        const midX = ((pts[i].x + pts[i + 1].x) / 2) * w;
        const midY = ((pts[i].y + pts[i + 1].y) / 2) * h;
        ctx.quadraticCurveTo(pts[i].x * w, pts[i].y * h, midX, midY);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x * w, last.y * h);
    ctx.stroke();
    ctx.restore();
}

function redrawAllStrokes() {
    if (!drawingCanvas || !ctx) return;
    clearLocalCanvasGraphics();
    const wrapper = document.getElementById('canvasStageWrapper');
    const w = wrapper ? wrapper.clientWidth : 300;
    const h = wrapper ? wrapper.clientHeight : 300;

    strokesList.forEach(s => drawSingleStroke(s, w, h));
}

function getNormalizedPoint(evt) {
    const rect = drawingCanvas.getBoundingClientRect();
    let clientX, clientY;
    if (evt.touches && evt.touches.length > 0) {
        clientX = evt.touches[0].clientX;
        clientY = evt.touches[0].clientY;
    } else {
        clientX = evt.clientX;
        clientY = evt.clientY;
    }
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1)));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / (rect.height || 1)));
    return {
        x: Math.round(x * 1000) / 1000,
        y: Math.round(y * 1000) / 1000
    };
}

function canIDrawNow() {
    return currentRoomState &&
           currentRoomState.status === 'playing' &&
           currentRoomState.drawer === currentUser;
}

function scheduleCanvasSync(forceImmediateDbSave = false) {
    if (!canIDrawNow()) return;
    const now = Date.now();
    const roundId = currentRoomState.roundId || 'default';

    // ۱. ارسال آنی و فوق‌سریع روی Realtime Broadcast (هر ۴۵ میلی‌ثانیه بدون درگیر کردن دیتابیس)
    const doBroadcast = () => {
        lastBroadcastTime = Date.now();
        pendingBroadcastTimer = null;
        broadcastCanvasLive(roundId, strokesList);
    };
    if (forceImmediateDbSave || (now - lastBroadcastTime >= 45)) {
        if (pendingBroadcastTimer) clearTimeout(pendingBroadcastTimer);
        doBroadcast();
    } else if (!pendingBroadcastTimer) {
        pendingBroadcastTimer = setTimeout(doBroadcast, 45);
    }

    // ۲. ذخیره پشتیبان در دیتابیس (هنگام برداشتن قلم یا هر ۷۰۰ میلی‌ثانیه برای بازیابی در صورت رفرش صفحه)
    const doDbSave = () => {
        lastDbCanvasSyncTime = Date.now();
        pendingDbCanvasTimer = null;
        saveCanvasStateToDb(roundId, strokesList).catch(() => {});
    };
    if (forceImmediateDbSave || (now - lastDbCanvasSyncTime >= 700)) {
        if (pendingDbCanvasTimer) clearTimeout(pendingDbCanvasTimer);
        doDbSave();
    } else if (!pendingDbCanvasTimer) {
        pendingDbCanvasTimer = setTimeout(doDbSave, 700);
    }
}

function handlePointerStart(e) {
    if (!canIDrawNow()) return;
    if (e.cancelable) e.preventDefault();
    isDrawing = true;
    const pt = getNormalizedPoint(e);
    activeStroke = {
        color: isEraserMode ? '#ffffff' : brushColor,
        size: isEraserMode ? Math.max(16, brushSize * 1.8) : brushSize,
        points: [pt]
    };
    strokesList.push(activeStroke);
    redrawAllStrokes();
    scheduleCanvasSync(false);
}

function handlePointerMove(e) {
    if (!isDrawing || !activeStroke || !canIDrawNow()) return;
    if (e.cancelable) e.preventDefault();
    const pt = getNormalizedPoint(e);
    const prev = activeStroke.points[activeStroke.points.length - 1];
    const dist = Math.hypot(pt.x - prev.x, pt.y - prev.y);
    if (dist < 0.004) return;
    activeStroke.points.push(pt);
    redrawAllStrokes();
    scheduleCanvasSync(false);
}

function handlePointerEnd() {
    if (!isDrawing) return;
    isDrawing = false;
    activeStroke = null;
    scheduleCanvasSync(true);
}

if (drawingCanvas) {
    drawingCanvas.addEventListener('mousedown', handlePointerStart);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerEnd);

    drawingCanvas.addEventListener('touchstart', handlePointerStart, { passive: false });
    drawingCanvas.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerEnd);
}

// ==================== ابزارهای نقاش ====================
window.selectBrushColor = function(color, btnEl) {
    isEraserMode = false;
    brushColor = color;
    document.querySelectorAll('#colorPaletteRow .color-swatch').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    document.getElementById('penToolBtn')?.classList.add('active');
    document.getElementById('eraserToolBtn')?.classList.remove('active');
};

window.selectBrushSize = function(size, btnEl) {
    brushSize = Number(size);
    document.querySelectorAll('.brush-sizes-group .size-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
};

window.activatePenTool = function() {
    isEraserMode = false;
    document.getElementById('penToolBtn')?.classList.add('active');
    document.getElementById('eraserToolBtn')?.classList.remove('active');
};

window.activateEraserTool = function() {
    isEraserMode = true;
    document.getElementById('eraserToolBtn')?.classList.add('active');
    document.getElementById('penToolBtn')?.classList.remove('active');
};

window.undoLastStroke = function() {
    if (!canIDrawNow() || strokesList.length === 0) return;
    strokesList.pop();
    redrawAllStrokes();
    scheduleCanvasSync(true);
    if (navigator.vibrate) navigator.vibrate(15);
};

window.clearEntireCanvas = function(syncToServer = true) {
    if (syncToServer && !canIDrawNow()) return;
    strokesList = [];
    clearLocalCanvasGraphics();
    if (syncToServer) {
        scheduleCanvasSync(true);
        if (navigator.vibrate) navigator.vibrate(25);
    }
};

// ==================== اکشن‌های راند: تعویض کلمه، راهنمایی، رد کردن نوبت ====================
window.changeSecretWord = async function() {
    if (!canIDrawNow()) return;
    const left = currentRoomState.wordChangesLeft ?? 0;
    if (left <= 0) {
        alert("تعداد دفعات تعویض کلمه تو این راند تموم شده نفسم!");
        return;
    }
    const used = Array.isArray(currentRoomState.usedWords) ? [...currentRoomState.usedWords] : [];
    const newWord = pickRandomWord(used);
    used.push(newWord);

    const newRoundId = 'rnd_' + Date.now();
    strokesList = [];
    clearLocalCanvasGraphics();

    try {
        broadcastCanvasLive(newRoundId, []);
        await saveCanvasStateToDb(newRoundId, []);
        await mergeRoomState({
            roundId: newRoundId,
            secretWord: newWord,
            usedWords: used.slice(-250),
            revealedIndices: [],
            wordChangesLeft: left - 1
        });
    } catch (e) {
        console.error(e);
    }
};

window.useLetterHint = async function() {
    if (!currentRoomState || currentRoomState.status !== 'playing') return;
    const word = currentRoomState.secretWord || '';
    const revealed = Array.isArray(currentRoomState.revealedIndices) ? [...currentRoomState.revealedIndices] : [];

    if (revealed.length >= 2 || revealed.length >= Math.floor(word.length / 2)) {
        alert("حداکثر راهنمایی این کلمه رو گرفتی! حالا حدس بزن 💡");
        return;
    }

    const candidates = [];
    for (let i = 0; i < word.length; i++) {
        if (word[i] !== ' ' && !revealed.includes(i)) {
            candidates.push(i);
        }
    }
    if (candidates.length === 0) return;

    const chosenIdx = candidates[Math.floor(Math.random() * candidates.length)];
    revealed.push(chosenIdx);

    try {
        await mergeRoomState({ revealedIndices: revealed });
        if (navigator.vibrate) navigator.vibrate(20);
    } catch (e) {
        console.error(e);
    }
};

window.skipCurrentTurn = async function() {
    if (!canIDrawNow()) return;
    if (!confirm("می‌خوای این کلمه رو رد کنی و نوبت بره برای پارتنرت؟")) return;

    try {
        await mergeRoomState({
            status: 'round_end',
            autoNextDeadline: Date.now() + 4200,
            lastRoundResult: {
                reason: 'skipped',
                word: currentRoomState.secretWord,
                pointsEarned: 0,
                winner: null,
                drawer: currentRoomState.drawer,
                roundNumber: currentRoomState.roundNumber
            }
        });
    } catch (e) {
        console.error(e);
    }
};

// ==================== محاسبه جایزه سرعت و ثبت حدس کلمه در لیست دائمی ====================
function calculateCurrentSpeedBonus(roomData) {
    if (!roomData || !roomData.roundDeadline || !roomData.roundDuration) return 2;
    const totalMs = roomData.roundDuration * 1000;
    const remainingMs = Math.max(0, roomData.roundDeadline - Date.now());
    const remainingRatio = remainingMs / totalMs;

    if (remainingRatio >= 0.62) return 3;
    if (remainingRatio >= 0.28) return 2;
    return 1;
}

window.submitWordGuess = async function() {
    if (!currentRoomState || currentRoomState.status !== 'playing') return;
    if (currentRoomState.drawer === currentUser) return;

    const inp = document.getElementById('guessWordInput');
    if (!inp) return;
    const rawGuess = inp.value.trim();
    if (!rawGuess) return;
    inp.value = '';

    const normalizedGuess = normalizePersianWord(rawGuess);
    const normalizedSecret = normalizePersianWord(currentRoomState.secretWord || '');

    // ۱. حدس درست!
    if (normalizedGuess === normalizedSecret && normalizedSecret.length > 0) {
        const earnedPoints = calculateCurrentSpeedBonus(currentRoomState);
        const newScoreMahdi = (currentRoomState.scoreMahdi || 0) + (currentUser === 'مهدی' ? earnedPoints : 0);
        const newScoreParmis = (currentRoomState.scoreParmis || 0) + (currentUser === 'پارمیس' ? earnedPoints : 0);
        const myNewTotal = currentUser === 'مهدی' ? newScoreMahdi : newScoreParmis;
        const target = currentRoomState.targetPoints || 30;

        if (navigator.vibrate) navigator.vibrate([40, 60, 80]);

        if (myNewTotal >= target) {
            await mergeRoomState({
                status: 'match_winner',
                scoreMahdi: newScoreMahdi,
                scoreParmis: newScoreParmis,
                matchWinner: currentUser,
                lastRoundResult: {
                    reason: 'guessed',
                    word: currentRoomState.secretWord,
                    pointsEarned: earnedPoints,
                    winner: currentUser,
                    drawer: currentRoomState.drawer,
                    roundNumber: currentRoomState.roundNumber
                }
            });
        } else {
            await mergeRoomState({
                status: 'round_end',
                scoreMahdi: newScoreMahdi,
                scoreParmis: newScoreParmis,
                autoNextDeadline: Date.now() + 4200,
                lastRoundResult: {
                    reason: 'guessed',
                    word: currentRoomState.secretWord,
                    pointsEarned: earnedPoints,
                    winner: currentUser,
                    drawer: currentRoomState.drawer,
                    roundNumber: currentRoomState.roundNumber
                }
            });
        }
        return;
    }

    // ۲. حدس اشتباه یا نزدیک — ثبت در لیست دائمی حدس‌های این راند
    const isClose = getEditDistance(normalizedGuess, normalizedSecret) === 1;
    const guessesArr = Array.isArray(currentRoomState.guesses) ? [...currentRoomState.guesses] : [];
    guessesArr.push({
        id: 'g_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
        author: currentUser,
        text: rawGuess,
        isClose: isClose
    });

    try {
        await mergeRoomState({
            guesses: guessesArr.slice(-60)
        });
    } catch (e) {
        console.error(e);
    }
};

const guessInputEl = document.getElementById('guessWordInput');
if (guessInputEl) {
    guessInputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            window.submitWordGuess();
        }
    });
    guessInputEl.addEventListener('focus', () => {
        setTimeout(syncGameViewport, 80);
        setTimeout(syncGameViewport, 250);
    });
}

// ==================== رفتن به راند بعدی (دستی یا خودکار پس از پایان تایمر) ====================
window.proceedToNextRound = async function() {
    if (!currentRoomState || currentRoomState.status !== 'round_end' || isAdvancingRound) return;
    isAdvancingRound = true;

    const nextBtn = document.getElementById('nextRoundBtn');
    if (nextBtn) nextBtn.disabled = true;

    try {
        const latest = await fetchLatestRoomState();
        if (latest.status !== 'round_end') {
            handleIncomingRoomState(latest);
            return;
        }

        const nextDrawer = (latest.drawer === 'مهدی') ? 'پارمیس' : 'مهدی';
        const nextGuesser = (nextDrawer === 'مهدی') ? 'پارمیس' : 'مهدی';
        const used = Array.isArray(latest.usedWords) ? [...latest.usedWords] : [];
        const nextWord = pickRandomWord(used);
        used.push(nextWord);

        const nowMs = Date.now();
        const duration = latest.roundDuration || 120;
        const nextRoundId = 'rnd_' + nowMs;

        strokesList = [];
        clearLocalCanvasGraphics();

        broadcastCanvasLive(nextRoundId, []);
        await saveCanvasStateToDb(nextRoundId, []);

        await mergeRoomState({
            status: 'playing',
            roundNumber: (latest.roundNumber || 1) + 1,
            roundId: nextRoundId,
            drawer: nextDrawer,
            guesser: nextGuesser,
            secretWord: nextWord,
            usedWords: used.slice(-250),
            revealedIndices: [],
            wordChangesLeft: 2,
            roundStartTime: nowMs,
            roundDeadline: nowMs + (duration * 1000),
            autoNextDeadline: null,
            guesses: [],
            lastRoundResult: null
        });
    } catch (e) {
        console.error(e);
    } finally {
        isAdvancingRound = false;
        if (nextBtn) nextBtn.disabled = false;
    }
};

window.returnToLobbyFromWinner = async function() {
    try {
        await mergeRoomState({
            status: 'lobby',
            readyMahdi: false,
            readyParmis: false,
            guesses: [],
            lastRoundResult: null,
            matchWinner: null
        });
        switchToLobbyView();
    } catch (e) {
        switchToLobbyView();
    }
};

// ثبت برد در جدول افتخارات کل تاریخ (game_stats)
async function recordMatchWinInStats(winnerName) {
    try {
        const { data } = await sb
            .from('game_stats')
            .select('*')
            .eq('id', 'drawGame')
            .maybeSingle();

        const currentM = Number(data?.wins_mahdi || 0);
        const currentP = Number(data?.wins_parmis || 0);
        const currentTotal = Number(data?.total_matches || (currentM + currentP));

        const nextRow = {
            id: 'drawGame',
            wins_mahdi: currentM + (winnerName === 'مهدی' ? 1 : 0),
            wins_parmis: currentP + (winnerName === 'پارمیس' ? 1 : 0),
            total_matches: currentTotal + 1,
            last_winner: winnerName,
            updated_at: new Date().toISOString()
        };

        await sb.from('game_stats').upsert(nextRow, { onConflict: 'id' });
        applyStatsUI(nextRow);
    } catch (e) {
        console.error("Failed to record match win:", e);
    }
}

// ==================== رندر کردن رابط کاربری اتاق، لیست حدس‌ها و وضعیت Ready ====================
function buildWordMaskString(secretWord, revealedIndices = []) {
    if (!secretWord) return '';
    const revSet = new Set(revealedIndices);
    const chars = [];
    for (let i = 0; i < secretWord.length; i++) {
        if (secretWord[i] === ' ') {
            chars.push('   ');
        } else if (revSet.has(i)) {
            chars.push(secretWord[i]);
        } else {
            chars.push('_');
        }
    }
    return chars.join(' ');
}

function updateLobbyReadyUI(roomData) {
    const rMahdi = !!roomData.readyMahdi;
    const rParmis = !!roomData.readyParmis;

    const boxM = document.getElementById('readyBoxMahdi');
    const pillM = document.getElementById('readyPillMahdi');
    const boxP = document.getElementById('readyBoxParmis');
    const pillP = document.getElementById('readyPillParmis');

    if (boxM) boxM.classList.toggle('is-ready', rMahdi);
    if (pillM) {
        pillM.innerHTML = rMahdi
            ? '<i class="fa-solid fa-check"></i><span>آماده!</span>'
            : '<i class="fa-regular fa-clock"></i><span>در انتظار...</span>';
    }

    if (boxP) boxP.classList.toggle('is-ready', rParmis);
    if (pillP) {
        pillP.innerHTML = rParmis
            ? '<i class="fa-solid fa-check"></i><span>آماده!</span>'
            : '<i class="fa-regular fa-clock"></i><span>در انتظار...</span>';
    }

    const myReady = (currentUser === 'مهدی') ? rMahdi : rParmis;
    const partnerReady = (currentUser === 'مهدی') ? rParmis : rMahdi;
    const readyBtn = document.getElementById('toggleReadyBtn');
    const readyBtnText = document.getElementById('readyBtnText');
    const helperNote = document.getElementById('readyHelperNote');

    if (readyBtn) readyBtn.classList.toggle('is-ready-active', myReady);
    if (readyBtnText) {
        readyBtnText.textContent = myReady
            ? 'آماده‌ام! ✅ (برای لغو کلیک کن)'
            : 'آماده‌ام! (Ready)';
    }

    if (helperNote) {
        if (myReady && partnerReady) {
            helperNote.textContent = 'هر دو نفر آماده! در حال ورود به بوم نقاشی... 🎨';
        } else if (myReady && !partnerReady) {
            helperNote.textContent = `تو آماده‌ای! منتظریم تا ${partnerName} هم دکمه «آماده‌ام» رو بزنه... ⏳`;
        } else if (!myReady && partnerReady) {
            helperNote.textContent = `${partnerName} آماده‌ست و منتظر توئه! دکمه «آماده‌ام» رو بزن 🚀`;
        } else {
            helperNote.textContent = 'وقتی هر دو نفر وارد این صفحه بشن و «آماده‌ام» رو بزنن، بازی خودکار شروع میشه! 🚀';
        }
    }

    if (rMahdi && rParmis && !isStartingCountdown && roomData.status !== 'playing') {
        runReadyCountdownOverlay();
    }
}

function renderPermanentGuessesList(guesses = []) {
    const countBadge = document.getElementById('guessesCountBadge');
    const listEl = document.getElementById('guessesFeedList');
    if (countBadge) countBadge.textContent = `${guesses.length} حدس`;
    if (!listEl) return;

    if (guesses.length === 0) {
        listEl.innerHTML = `<div class="guesses-empty-text">هنوز حدسی زده نشده... منتظر اولین حدس! 🎯</div>`;
        lastRenderedGuessCount = 0;
        return;
    }

    listEl.innerHTML = guesses.map(g => `
        <div class="guess-row-item ${g.isClose ? 'is-close' : ''}">
            <div class="guess-row-right">
                <span class="guess-row-author">${escapeHtml(g.author || '')}:</span>
                <span class="guess-row-text">${escapeHtml(g.text || '')}</span>
            </div>
            <span class="guess-row-status">${g.isClose ? '🔥 خیلی نزدیک!' : '❌ اشتباه'}</span>
        </div>
    `).join('');

    if (guesses.length > lastRenderedGuessCount) {
        playGameTone('guess');
        listEl.scrollTop = listEl.scrollHeight;
    }
    lastRenderedGuessCount = guesses.length;
}

function renderRoomUI(roomData) {
    if (!roomData) return;

    if (roomData.targetPoints) selectedTargetPoints = Number(roomData.targetPoints);
    if (roomData.roundDuration) selectedRoundSeconds = Number(roomData.roundDuration);
    updateSettingsPillsUI(selectedTargetPoints, selectedRoundSeconds);
    updateLobbyReadyUI(roomData);

    const resumeBar = document.getElementById('activeMatchResumeBar');
    const resumeTxt = document.getElementById('resumeMatchText');
    const isMatchActive = (roomData.status === 'playing' || roomData.status === 'round_end');

    if (resumeBar) {
        resumeBar.style.display = isMatchActive ? 'flex' : 'none';
    }
    if (resumeTxt && isMatchActive) {
        resumeTxt.textContent = `ورود به بازیِ در حال اجرا (راند ${roomData.roundNumber || 1})`;
    }

    document.getElementById('liveScoreMahdi').textContent = roomData.scoreMahdi || 0;
    document.getElementById('liveScoreParmis').textContent = roomData.scoreParmis || 0;
    document.getElementById('liveTargetScore').textContent = roomData.targetPoints || 30;
    document.getElementById('scorePillMahdi')?.classList.toggle('active-turn', roomData.drawer === 'مهدی');
    document.getElementById('scorePillParmis')?.classList.toggle('active-turn', roomData.drawer === 'پارمیس');

    if (roomData.status === 'lobby') {
        switchToLobbyView();
        return;
    }

    if (!isInsideArenaSession && roomData.status !== 'match_winner') {
        const justStarted = roomData.roundStartTime && (Date.now() - roomData.roundStartTime < 8000) && roomData.roundNumber === 1;
        if (justStarted) {
            isInsideArenaSession = true;
            switchToArenaView();
        } else {
            return;
        }
    }

    if (document.getElementById('gameArenaView').style.display === 'none') {
        switchToArenaView();
    }

    document.getElementById('roundNumberBadge').textContent = `راند ${roomData.roundNumber || 1}`;

    const amIDrawer = (roomData.drawer === currentUser);
    const drawerBanner = document.getElementById('drawerRoleBanner');
    const guesserBanner = document.getElementById('guesserRoleBanner');
    const drawerControls = document.getElementById('drawerControlsPanel');
    const guesserInputRow = document.getElementById('guesserInputRow');
    const lockBadge = document.getElementById('canvasGuesserLockBadge');

    if (amIDrawer) {
        drawerBanner.style.display = 'flex';
        guesserBanner.style.display = 'none';
        drawerControls.style.display = 'flex';
        if (guesserInputRow) guesserInputRow.style.display = 'none';
        if (lockBadge) lockBadge.style.display = 'none';

        document.getElementById('drawerSecretWord').textContent = roomData.secretWord || '...';
        const left = roomData.wordChangesLeft ?? 0;
        const changeBtn = document.getElementById('changeWordBtn');
        const changeTxt = document.getElementById('changeWordCountText');
        if (changeTxt) changeTxt.textContent = `تعویض (${left})`;
        if (changeBtn) changeBtn.disabled = (left <= 0);
    } else {
        drawerBanner.style.display = 'none';
        guesserBanner.style.display = 'flex';
        drawerControls.style.display = 'none';
        if (guesserInputRow) guesserInputRow.style.display = 'flex';
        if (lockBadge) lockBadge.style.display = 'inline-flex';

        document.getElementById('guesserStatusTitle').textContent = `${roomData.drawer} داره نقاشی می‌کشه 🎨`;
        const word = roomData.secretWord || '';
        const cleanLen = word.replace(/\s+/g, '').length;
        const hasSpace = word.includes(' ');
        document.getElementById('wordMaskDisplay').textContent = buildWordMaskString(word, roomData.revealedIndices || []);
        document.getElementById('wordLengthBadge').textContent = hasSpace ? `${cleanLen} حرفی (۲ کلمه)` : `${cleanLen} حرفی`;
    }

    const guesses = Array.isArray(roomData.guesses) ? roomData.guesses : [];
    renderPermanentGuessesList(guesses);

    const roundModal = document.getElementById('roundResultModal');
    const winnerModal = document.getElementById('matchWinnerModal');

    if (roomData.status === 'round_end' && roomData.lastRoundResult) {
        const res = roomData.lastRoundResult;
        const celebKey = `round_${roomData.roundId}_${res.reason}`;
        if (lastHandledCelebrationKey !== celebKey) {
            lastHandledCelebrationKey = celebKey;
            if (res.reason === 'guessed') {
                launchConfetti(2300);
                playGameTone('correct');
            } else if (res.reason === 'timeout') {
                playGameTone('timeout');
            }
        }

        document.getElementById('roundRevealedWord').textContent = res.word || '...';
        const iconEl = document.getElementById('roundModalIcon');
        const titleEl = document.getElementById('roundModalTitle');
        const subEl = document.getElementById('roundModalSubtitle');
        const ptsBadge = document.getElementById('roundPointsBadge');

        if (res.reason === 'guessed') {
            iconEl.textContent = '🎉';
            titleEl.textContent = `${res.winner} درست حدس زد!`;
            subEl.textContent = `نقاشیِ ${res.drawer} عالی بود و امتیاز ثبت شد`;
            ptsBadge.textContent = `+${res.pointsEarned} امتیاز برای ${res.winner}`;
            ptsBadge.style.display = 'inline-block';
        } else if (res.reason === 'timeout') {
            iconEl.textContent = '⏰';
            titleEl.textContent = 'وقت این راند تموم شد!';
            subEl.textContent = 'نوبت نقاشی خودکار عوض میشه و می‌ریم کلمه بعدی';
            ptsBadge.style.display = 'none';
        } else {
            iconEl.textContent = '🏳️';
            titleEl.textContent = 'این کلمه رد شد!';
            subEl.textContent = 'نوبت نقاشی خودکار عوض میشه';
            ptsBadge.style.display = 'none';
        }

        roundModal.classList.add('active');
        winnerModal.classList.remove('active');
    } else if (roomData.status === 'match_winner') {
        const celebKey = `winner_${roomData.matchId}`;
        if (lastHandledCelebrationKey !== celebKey) {
            lastHandledCelebrationKey = celebKey;
            launchConfetti(4200);
            playGameTone('win');
        }

        if (roomData.matchId && roomData.matchWinner === currentUser && recordedWinMatchId !== roomData.matchId) {
            recordedWinMatchId = roomData.matchId;
            localStorage.setItem('lastRecordedWinMatchId', recordedWinMatchId);
            recordMatchWinInStats(currentUser);
        }

        document.getElementById('winnerModalTitle').textContent = `قهرمان این دست: ${roomData.matchWinner}! 🏆`;
        document.getElementById('winnerModalSub').textContent = `با رسیدن به سقف ${roomData.targetPoints} امتیاز برنده این ماراتن شد!`;
        document.getElementById('finalScoreMahdi').textContent = roomData.scoreMahdi || 0;
        document.getElementById('finalScoreParmis').textContent = roomData.scoreParmis || 0;
        document.getElementById('updatedHistoryNote').textContent = `۱ بُرد طلایی به کارنامه ${roomData.matchWinner} اضافه شد ✨`;

        roundModal.classList.remove('active');
        winnerModal.classList.add('active');
    } else {
        roundModal.classList.remove('active');
        winnerModal.classList.remove('active');
    }

    setTimeout(() => resizeDrawingCanvas(), 30);
}

function handleIncomingRoomState(data) {
    if (!data || typeof data !== 'object') return;
    const prevRoundId = currentRoomState ? currentRoomState.roundId : null;
    currentRoomState = data;

    if (data.roundId && data.roundId !== prevRoundId) {
        lastRenderedGuessCount = 0;
        strokesList = [];
        clearLocalCanvasGraphics();
    }
    renderRoomUI(data);
}

function handleIncomingCanvasState(cData) {
    if (!cData || typeof cData !== 'object') return;
    if (currentRoomState && cData.roundId && cData.roundId !== currentRoomState.roundId) return;
    if (isDrawing && cData.updatedBy === currentUser) return;

    strokesList = Array.isArray(cData.strokes) ? cData.strokes : [];
    redrawAllStrokes();
}

// ==================== حلقه تایمر راند + انتقال خودکار به راند بعدی ====================
function startLocalTimerLoop() {
    if (roundTimerInterval) clearInterval(roundTimerInterval);
    roundTimerInterval = setInterval(async () => {
        if (!currentRoomState) return;

        // ۱. شمارش معکوس ۴ ثانیه‌ای برای رفتن خودکار به کلمه و نوبت بعدی
        if (currentRoomState.status === 'round_end') {
            const deadline = currentRoomState.autoNextDeadline || (Date.now() + 4000);
            const diffMs = deadline - Date.now();
            const remMs = Math.max(0, diffMs);
            const remSec = Math.ceil(remMs / 1000);
            const fillEl = document.getElementById('autoNextFill');
            const txtEl = document.getElementById('autoNextCountdownText');

            if (fillEl) {
                const pct = Math.max(0, Math.min(100, (remMs / 4200) * 100));
                fillEl.style.width = `${pct}%`;
            }
            if (txtEl) {
                txtEl.textContent = `رفتن خودکار به کلمه بعدی و تعویض نوبت در ${remSec} ثانیه...`;
            }

            const amIDrawer = currentRoomState.drawer === currentUser;
            const shouldTriggerAutoNext = amIDrawer ? (diffMs <= 0) : (diffMs <= -900);

            if (shouldTriggerAutoNext && autoNextTriggeredForRoundId !== currentRoomState.roundId) {
                autoNextTriggeredForRoundId = currentRoomState.roundId;
                window.proceedToNextRound();
            }
            return;
        }

        // ۲. بررسی تایمر راند در حال اجرا
        if (currentRoomState.status !== 'playing') return;

        const durationMs = (currentRoomState.roundDuration || 120) * 1000;
        const diffMs = (currentRoomState.roundDeadline || 0) - Date.now();
        const remainingMs = Math.max(0, diffMs);
        const remainingSec = Math.ceil(remainingMs / 1000);

        const mins = Math.floor(remainingSec / 60).toString().padStart(2, '0');
        const secs = (remainingSec % 60).toString().padStart(2, '0');

        const timerText = document.getElementById('timerCountText');
        const timerPill = document.getElementById('timerPill');
        const progressFill = document.getElementById('timerProgressBar');
        const bonusText = document.getElementById('speedBonusText');

        if (timerText) timerText.textContent = `${mins}:${secs}`;
        if (progressFill) {
            const pct = Math.max(0, Math.min(100, (remainingMs / durationMs) * 100));
            progressFill.style.width = `${pct}%`;
        }

        if (remainingSec <= 15 && remainingSec > 0) {
            timerPill?.classList.add('danger-time');
            if (remainingSec !== lastTickSecond) {
                lastTickSecond = remainingSec;
                playGameTone('tick');
            }
        } else {
            timerPill?.classList.remove('danger-time');
        }

        const bonus = calculateCurrentSpeedBonus(currentRoomState);
        if (bonusText) bonusText.textContent = `جایزه سرعت: +${bonus} امتیاز`;

        // اتمام زمان راند (نقاش در ثانیه ۰ و حدس‌زننده با ۹۰۰ms تاخیر پشتیبان تا تداخل ایجاد نشود)
        const amIDrawer = currentRoomState.drawer === currentUser;
        const shouldTriggerTimeout = amIDrawer ? (diffMs <= 0) : (diffMs <= -900);

        if (shouldTriggerTimeout && timeoutTriggeredForRoundId !== currentRoomState.roundId) {
            timeoutTriggeredForRoundId = currentRoomState.roundId;
            try {
                await mergeRoomState({
                    status: 'round_end',
                    autoNextDeadline: Date.now() + 4200,
                    lastRoundResult: {
                        reason: 'timeout',
                        word: currentRoomState.secretWord,
                        pointsEarned: 0,
                        winner: null,
                        drawer: currentRoomState.drawer,
                        roundNumber: currentRoomState.roundNumber
                    }
                });
            } catch (e) {}
        }
    }, 250);
}

// ==================== حضور آنلاین و اشتراک‌های زنده Supabase ====================
async function setGamePresence(inGame, useKeepalive = false) {
    if (!currentUser) return;
    const payload = {
        is_online: true,
        in_draw_game: inGame,
        last_seen: new Date().toISOString()
    };
    if (useKeepalive) {
        patchUserKeepalive(currentUser, payload);
        return;
    }
    try {
        await getDb();
        await sb
            .from('users')
            .upsert({ username: currentUser, ...payload }, { onConflict: 'username' });
    } catch (e) {}
}

window.addEventListener('beforeunload', () => {
    cancelMyReadyOnExit();
    setGamePresence(false, true);
});
document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible';
    setGamePresence(visible, !visible);
    if (visible) {
        refreshAllGameData();
    }
});

function applyUserRowUI(uRow) {
    if (!uRow || !uRow.username) return;
    const isMahdi = uRow.username === 'مهدی';
    const avatarEl = document.getElementById(isMahdi ? 'lobbyAvatarMahdi' : 'lobbyAvatarParmis');
    const ringEl = document.getElementById(isMahdi ? 'onlineRingMahdi' : 'onlineRingParmis');

    if (avatarEl) {
        avatarEl.style.backgroundImage = uRow.profile_pic ? `url(${uRow.profile_pic})` : `url("${defaultAvatarSVG}")`;
    }
    if (ringEl) {
        ringEl.classList.toggle('online', Boolean(uRow.is_online && uRow.in_draw_game));
    }
    if (uRow.username === partnerName) {
        updatePartnerPresenceBadge({
            isOnline: Boolean(uRow.is_online),
            inDrawGame: Boolean(uRow.in_draw_game)
        });
    }
}

function applyStatsUI(sRow) {
    if (!sRow) return;
    const wM = Number(sRow.wins_mahdi || 0);
    const wP = Number(sRow.wins_parmis || 0);
    const tot = Number(sRow.total_matches || (wM + wP));
    document.getElementById('totalWinsMahdi').textContent = wM;
    document.getElementById('totalWinsParmis').textContent = wP;
    document.getElementById('totalMatchesPlayed').textContent = `${tot} بازی ثبت‌شده`;
}

async function refreshAllGameData() {
    try {
        await getDb();
        const [usersRes, statsRes, roomsRes] = await Promise.all([
            sb.from('users').select('username, is_online, in_draw_game, profile_pic').in('username', ['مهدی', 'پارمیس']),
            sb.from('game_stats').select('*').eq('id', 'drawGame').maybeSingle(),
            sb.from('game_rooms').select('*').in('id', ['drawRoom', 'drawCanvas'])
        ]);

        if (usersRes.data) {
            usersRes.data.forEach(applyUserRowUI);
        }

        if (statsRes.data) {
            applyStatsUI(statsRes.data);
        }

        const roomRow = roomsRes.data?.find(r => r.id === 'drawRoom');
        const canvasRow = roomsRes.data?.find(r => r.id === 'drawCanvas');

        if (roomRow && roomRow.state && Object.keys(roomRow.state).length > 0) {
            handleIncomingRoomState(roomRow.state);
        } else {
            await replaceRoomState({ ...DEFAULT_ROOM_STATE });
        }

        if (canvasRow && canvasRow.state) {
            handleIncomingCanvasState(canvasRow.state);
        }
    } catch (err) {
        console.error("Game initial refresh error:", err);
    }
}

function setupGameRealtime() {
    if (gameRealtimeChannel) {
        sb.removeChannel(gameRealtimeChannel);
        gameRealtimeChannel = null;
        isChannelSubscribed = false;
    }

    gameRealtimeChannel = sb.channel('parmis-draw-game-hub', {
        config: {
            broadcast: { self: false }
        }
    })
        // ۱. دریافت آنی خطوط نقاشی از طریق Broadcast (بدون لگ)
        .on('broadcast', { event: 'canvas_strokes' }, ({ payload }) => {
            if (payload) {
                handleIncomingCanvasState(payload);
            }
        })
        // ۲. دریافت تغییرات وضعیت اتاق و بوم ذخیره‌شده
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rooms' }, (payload) => {
            const row = payload.new;
            if (!row) return;
            if (row.id === 'drawRoom' && row.state) {
                handleIncomingRoomState(row.state);
            } else if (row.id === 'drawCanvas' && row.state) {
                handleIncomingCanvasState(row.state);
            }
        })
        // ۳. دریافت تغییرات تابلو افتخارات کل تاریخ
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_stats' }, (payload) => {
            if (payload.new && payload.new.id === 'drawGame') {
                applyStatsUI(payload.new);
            }
        })
        // ۴. دریافت تغییرات آنلاین بودن و آواتار کاربران
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
            if (payload.new) {
                applyUserRowUI(payload.new);
            }
        })
        .subscribe((status) => {
            isChannelSubscribed = (status === 'SUBSCRIBED');
            if (isChannelSubscribed) {
                console.log('✅ Draw Game Supabase Realtime + Broadcast connected');
            }
        });
}

function updatePartnerPresenceBadge(pData) {
    const dot = document.getElementById('partnerPresenceDot');
    const txt = document.getElementById('partnerPresenceText');
    if (!dot || !txt) return;

    if (pData.inDrawGame && pData.isOnline) {
        dot.className = 'presence-dot online';
        txt.textContent = `${partnerName} الان داخل صفحه بازیه 🎮`;
    } else if (pData.isOnline) {
        dot.className = 'presence-dot online';
        txt.textContent = `${partnerName} تو برنامه آنلاینه (بیرون از بازی)`;
    } else {
        dot.className = 'presence-dot';
        txt.textContent = `منتظر ورود ${partnerName}...`;
    }
}

function startGameFallbackSyncIfNeeded() {
    if (gameFallbackSyncTimer) return;
    gameFallbackSyncTimer = setInterval(() => {
        if (isChannelSubscribed || document.visibilityState !== 'visible' || !sb) return;
        refreshAllGameData().catch(() => {});
    }, 2000);
}

function initDrawGameApp() {
    syncGameViewport();
    startLocalTimerLoop();
    ensureSupabaseReady().then((client) => {
        sb = client;
        setGamePresence(true);
        refreshAllGameData();
        setupGameRealtime();
        startGameFallbackSyncIfNeeded();
    }).catch((err) => {
        console.error('Failed to boot Supabase in game-draw.js:', err);
    });
}

initDrawGameApp();

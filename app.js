// ==================== اتصال ماژولار به دیتابیس (بدون کدهای اتصال در فایل اصلی) ====================
import {
    getSupabaseSync,
    ensureSupabaseReady,
    patchUserKeepalive,
    fetchAllRows,
    upsertUserFields
} from './db.js';

let sb = getSupabaseSync();
let isRealtimeConnected = false;
let fallbackSyncTimer = null;
let soundsLoaded = false;
let fullMessagesArchiveLoaded = false;

async function getDb() {
    if (!sb) sb = await ensureSupabaseReady();
    return sb;
}

// ==================== سیستم ضد بنر تبلیغاتی (ایزوله‌سازی کامل محیط برنامه) ====================
const allowedRootIds = new Set(['otaUpdateBanner', 'loginScreen', 'actionModal', 'partnerProfileModal', 'settingsModal', 'appContainer']);
function removeInjectedBanners() {
    document.querySelectorAll('a[href*="netlify"]:not(.square-card), iframe[src*="netlify"], [id*="netlify"], [class*="netlify"], div[data-netlify-deploy-drawer]').forEach(el => {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
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
removeInjectedBanners();
const bannerObserver = new MutationObserver(() => removeInjectedBanners());
window.addEventListener('DOMContentLoaded', () => {
    removeInjectedBanners();
    bannerObserver.observe(document.body, { childList: true, subtree: true });
});

// ==================== قفل هوشمند صفحه و کیبورد برای iOS و Android ====================
function syncViewport() {
    const vv = window.visualViewport;
    if (vv && window.innerWidth <= 500) {
        if (window.scrollY !== 0 || window.scrollX !== 0) {
            window.scrollTo(0, 0);
        }
        document.documentElement.style.setProperty('--vv-height', `${vv.height}px`);
        document.documentElement.style.setProperty('--vv-top', `${vv.offsetTop}px`);
        const isKeyboardOpen = (window.innerHeight - vv.height) > 110;
        document.body.classList.toggle('keyboard-open', isKeyboardOpen);
    } else {
        document.documentElement.style.setProperty('--vv-height', '100dvh');
        document.documentElement.style.setProperty('--vv-top', '0px');
        document.body.classList.remove('keyboard-open');
    }
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages && document.getElementById('chatScreen')?.style.display === 'flex' && !isSearchOpen) {
        const distFromBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
        if (distFromBottom < 180) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }
}

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
}
window.addEventListener('resize', syncViewport);
window.addEventListener('scroll', () => {
    if (window.innerWidth <= 500 && (window.scrollY !== 0 || window.scrollX !== 0)) {
        window.scrollTo(0, 0);
    }
    syncViewport();
}, { passive: true });
syncViewport();

// ==================== توابع کمکی دیتابیس Supabase ====================
function generateDocId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function parseIsoDate(isoStr) {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d;
}

// توابع fetchAllRows و upsertUserFields از فایل مستقل db.js ایمپورت شده‌اند

function mapUserRow(r) {
    if (!r) return null;
    return {
        username: r.username,
        isOnline: Boolean(r.is_online),
        isTyping: Boolean(r.is_typing),
        inDrawGame: Boolean(r.in_draw_game),
        lastSeen: parseIsoDate(r.last_seen),
        profilePic: r.profile_pic || null,
        bio: r.bio ?? '',
        sounds: (r.sounds !== undefined) ? (r.sounds && typeof r.sounds === 'object' ? r.sounds : {}) : undefined,
        mood: r.mood && typeof r.mood === 'object' ? r.mood : {}
    };
}

function mapMessageRow(r) {
    return {
        id: r.id,
        text: r.text ?? '',
        sender: r.sender ?? '',
        seen: Boolean(r.seen),
        liked: Boolean(r.liked),
        edited: Boolean(r.edited),
        replyTo: r.reply_to || null,
        msgType: r.msg_type || 'text',
        mediaUrl: r.media_url || null,
        createdAt: r.created_at || new Date().toISOString(),
        dateObj: parseIsoDate(r.created_at) || new Date()
    };
}

function mapMemoryRow(r) {
    return {
        id: r.id,
        title: r.title ?? '',
        text: r.text ?? '',
        author: r.author ?? '',
        dateString: r.date_string ?? '',
        edited: Boolean(r.edited),
        createdAt: r.created_at || new Date().toISOString(),
        dateObj: parseIsoDate(r.created_at)
    };
}

function mapTodoRow(r) {
    return {
        id: r.id,
        title: r.title ?? '',
        createdBy: r.created_by ?? '',
        items: Array.isArray(r.items) ? r.items : [],
        createdAt: r.created_at || new Date().toISOString()
    };
}

function mapInstaRow(r) {
    return {
        id: r.id,
        imageUrl: r.image_url ?? '',
        mediaItems: Array.isArray(r.media_items) ? r.media_items : [],
        caption: r.caption ?? '',
        author: r.author ?? '',
        dateString: r.date_string ?? '',
        likes: Array.isArray(r.likes) ? r.likes : [],
        comments: Array.isArray(r.comments) ? r.comments : [],
        createdAt: r.created_at || new Date().toISOString(),
        dateObj: parseIsoDate(r.created_at)
    };
}

function mapStudyTaskRow(r) {
    return {
        id: r.id,
        title: r.title ?? '',
        day: r.day ?? 'شنبه',
        duration: r.duration ?? '',
        done: Boolean(r.done),
        addedBy: r.added_by ?? '',
        createdAt: r.created_at || new Date().toISOString()
    };
}

function mapStudyExamRow(r) {
    return {
        id: r.id,
        title: r.title ?? '',
        examDate: r.exam_date ?? '',
        topic: r.topic ?? '',
        done: Boolean(r.done),
        addedBy: r.added_by ?? '',
        createdAt: r.created_at || new Date().toISOString()
    };
}

// ==================== اطلاعات کاربران و متغیرهای سراسری ====================
const usersDB = {
    "مهدی": { pass: "1234" },
    "پارمیس": { pass: "4321" }
};

// آواتار پیش‌فرض مینیمال و روشن (SVG)
const defaultAvatarSVG = "data:image/svg+xml;utf8," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs>
            <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#e0e7ff"/>
                <stop offset="100%" stop-color="#c7d2fe"/>
            </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#g)"/>
        <circle cx="50" cy="38" r="18" fill="#4f46e5"/>
        <path d="M22 86 C22 65 78 65 78 86" fill="#4f46e5"/>
    </svg>
`);

let currentUser = localStorage.getItem('chatUsername');
let activeScreen = 'home'; // 'home' | 'chat'
let unreadDocsIds = [];
let isInitialMessagesLoad = true;
let isInitialInstaLoad = true;
let soundEnabled = localStorage.getItem('chatSoundEnabled') !== 'false';
let cachedMessages = new Map(); // id -> data
let notifiedMessageIds = new Set();
let notifiedInstaIds = new Set();
let appRealtimeChannel = null;
let appInitialized = false;

// متغیرهای نسخه ۱۳: انتخاب چندتایی، ویرایش و جستجو
let isSelectionMode = false;
let selectedMsgIds = new Set();
let editingMessage = null; // { id, text }
let replyingTo = null; // { id, sender, text }
let isSearchOpen = false;
let searchMatches = []; // آرایه آیدی پیام‌های منطبق
let currentSearchIndex = -1;

const loginScreen = document.getElementById('loginScreen');
const appContainer = document.getElementById('appContainer');
const homeScreen = document.getElementById('homeScreen');
const chatScreen = document.getElementById('chatScreen');

let myProfileData = { pic: `url("${defaultAvatarSVG}")`, bio: "", sounds: {}, hasCustomPic: false };
let partnerProfileData = { pic: `url("${defaultAvatarSVG}")`, bio: "", sounds: {} };

// ساخت لیست ایموجی‌ها
const emojiList = ['😂','🫂','🫠','💙','✨','🥹','🤍','🥺','🫣','😭','🤣','🤭','🩵','🫀','🪼','🦋','🕊','🫧','🍓','💎','🙄','😌','💕','🎀','😚','🥲','🫶','♥️','👑','🍫'];
const emojiPane = document.getElementById('pane-emoji');
if (emojiPane) {
    emojiPane.innerHTML = emojiList.map(e => `<button class="emoji-item" type="button" onclick="insertEmoji('${e}')">${e}</button>`).join('');
}

// ==================== باز کردن وب‌سایت دنیای پارمیس ====================
window.openParmisWorld = function() {
    window.open('https://willowy-bombolone-b6369d.netlify.app/', '_blank', 'noopener,noreferrer');
};

// ==================== فرمت‌دهی هوشمند تاریخ برای جداکننده پیام‌ها ====================
function getDateKey(dateObj) {
    if (!dateObj) return 'unknown';
    return `${dateObj.getFullYear()}-${dateObj.getMonth() + 1}-${dateObj.getDate()}`;
}

function formatDateSeparatorLabel(dateObj) {
    if (!dateObj) return 'ایمروز';
    const now = new Date();
    const todayKey = getDateKey(now);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayKey = getDateKey(yesterday);
    const msgKey = getDateKey(dateObj);

    if (msgKey === todayKey) return 'ایمروز';
    if (msgKey === yesterdayKey) return 'دیروز';

    try {
        const options = { day: 'numeric', month: 'long' };
        if (dateObj.getFullYear() !== now.getFullYear()) {
            options.year = 'numeric';
        }
        return new Intl.DateTimeFormat('fa-IR', options).format(dateObj);
    } catch (e) {
        return dateObj.toLocaleDateString('fa-IR');
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

// ==================== سیستم هوشمند تشخیص کلمات جادویی و پخش صدا ====================
const magicRules = [
    { key: 'magic_fereshteh', phrases: ['فرشته کوچولوی من'] },
    { key: 'magic_doostet_daram', phrases: ['دوستت دارم', 'دوست دارم'] },
    { key: 'magic_asheghetam', phrases: ['عاشقتم'] },
    { key: 'magic_ghalbe_mania', phrases: ['قلب منیا', 'قلب منی'] },
    { key: 'magic_nafase_mania', phrases: ['نفس منیا', 'نفس منی'] },
    { key: 'magic_cute', phrases: ['کیوت'] }
];

function detectMagicKey(text) {
    if (!text) return null;
    const clean = text.trim();
    for (const rule of magicRules) {
        for (const phrase of rule.phrases) {
            if (clean.includes(phrase)) {
                return rule.key;
            }
        }
    }
    return null;
}

let currentAudioObj = null;
window.playBase64Audio = function(base64Str) {
    if (!base64Str) return;
    try {
        if (currentAudioObj) {
            currentAudioObj.pause();
            currentAudioObj.currentTime = 0;
        }
        currentAudioObj = new Audio(base64Str);
        currentAudioObj.play().catch(err => {
            console.warn("پخش خودکار نیازمند تعامل اولیه با صفحه است:", err);
        });
    } catch (e) {
        console.error("Audio Play Error:", e);
    }
};

window.playMessageVoiceEffect = function(senderName, text, isAutoTrigger = false) {
    if (isAutoTrigger && !soundEnabled) return;

    const targetSounds = (senderName === currentUser) ? myProfileData.sounds : partnerProfileData.sounds;
    if (!targetSounds) return;

    const magicKey = detectMagicKey(text);
    if (magicKey && targetSounds[magicKey]) {
        window.playBase64Audio(targetSounds[magicKey]);
        return;
    }

    const randomList = targetSounds.randomSounds;
    if (Array.isArray(randomList) && randomList.length > 0) {
        const randomIndex = Math.floor(Math.random() * randomList.length);
        window.playBase64Audio(randomList[randomIndex]);
    }
};

window.toggleSoundMute = function() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('chatSoundEnabled', soundEnabled);
    updateSoundIcon();
};

function updateSoundIcon() {
    const btn = document.getElementById('soundToggleBtn');
    if (!btn) return;
    if (soundEnabled) {
        btn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
        btn.classList.remove('muted');
        btn.title = "صداهامونن فعاله کلیک کن برا بی صداا موچ";
    } else {
        btn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
        btn.classList.add('muted');
        btn.title = "صداهامونن غیر فعاله کلیک کن برا باا صداا موچ";
    }
}

function triggerMagicVisualParticles() {
    const container = document.getElementById('appContainer');
    if (!container) return;
    const emojis = ['💙', '🫂', '🫠', '🦋', '♥️'];
    for (let i = 0; i < 12; i++) {
        const span = document.createElement('span');
        span.className = 'magic-particle';
        span.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        span.style.left = (15 + Math.random() * 70) + '%';
        span.style.animationDelay = (Math.random() * 0.4) + 's';
        container.appendChild(span);
        setTimeout(() => span.remove(), 2200);
    }
}

// وضعیت آنلاین و تایپینگ (با پشتیبانی از keepalive هنگام بستن صفحه)
async function setOnlineStatus(isOnline, useKeepalive = false) {
    if (!currentUser) return;
    const payload = {
        is_online: isOnline,
        last_seen: new Date().toISOString()
    };
    if (!isOnline) {
        payload.is_typing = false;
    }
    if (useKeepalive) {
        patchUserKeepalive(currentUser, payload);
        return;
    }
    try {
        await upsertUserFields(currentUser, payload);
    } catch (error) {
        console.error(error);
    }
}

let lastSentTypingState = null;
async function setTypingStatus(isTyping) {
    if (!currentUser) return;
    if (lastSentTypingState === isTyping) return;
    lastSentTypingState = isTyping;
    try {
        await upsertUserFields(currentUser, { is_typing: isTyping });
    } catch (error) {}
}

window.addEventListener('beforeunload', () => setOnlineStatus(false, true));
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        setOnlineStatus(false, true);
    } else {
        setOnlineStatus(true);
        if (appInitialized) {
            refreshAllDataSilently();
        }
    }
});

function handleLogin() {
    const userInp = document.getElementById('usernameInp').value.trim();
    const passInp = document.getElementById('passwordInp').value.trim();
    const errEl = document.getElementById('loginError');

    if (usersDB[userInp] && usersDB[userInp].pass === passInp) {
        errEl.style.opacity = '0';
        localStorage.setItem('chatUsername', userInp);
        currentUser = userInp;
        document.getElementById('passwordInp').blur();
        loginScreen.style.opacity = '0';
        setTimeout(() => {
            loginScreen.style.display = 'none';
            appContainer.style.display = 'flex';
            syncViewport();
            initApp();
        }, 250);
    } else {
        errEl.style.opacity = '1';
        const box = document.querySelector('.login-card');
        box.style.transform = 'translateX(-6px)';
        setTimeout(() => box.style.transform = 'translateX(6px)', 70);
        setTimeout(() => box.style.transform = 'translateX(0)', 140);
    }
}

document.getElementById('loginBtn').addEventListener('click', handleLogin);
document.getElementById('passwordInp').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
});

// جابجایی بین صفحه هوم و چت
window.openChatView = function() {
    activeScreen = 'chat';
    homeScreen.style.display = 'none';
    chatScreen.style.display = 'flex';
    syncViewport();

    scrollToBottom(false);

    if (unreadDocsIds.length > 0) {
        const idsToMark = [...unreadDocsIds];
        unreadDocsIds = [];
        updateUnreadBadge(0);
        idsToMark.forEach(id => {
            const m = cachedMessages.get(id);
            if (m) m.seen = true;
        });
        sb.from('messages').update({ seen: true }).in('id', idsToMark).then(() => {}).catch(() => {});
    }
};

window.openHomeView = function() {
    activeScreen = 'home';
    setTypingStatus(false);
    exitSelectionMode();
    closeSearchBar();
    closeNotebookSheet();
    closeTodoSheet();
    if (window.closeInstaSheet) window.closeInstaSheet();
    if (window.closeStudySheet) window.closeStudySheet();
    if (window.closeInstaFullscreen) window.closeInstaFullscreen();
    document.getElementById('messageInput')?.blur();
    document.getElementById('emojiPanel').classList.remove('active');
    chatScreen.style.display = 'none';
    homeScreen.style.display = 'flex';
    syncViewport();
};

window.scrollToBottom = function(smooth = true) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
    });
};

function updateUnreadBadge(count) {
    const badge = document.getElementById('homeUnreadBadge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? '+99' : count;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

// منوی سه نقطه
window.toggleMenu = function(e, menuId) {
    if (e) e.stopPropagation();
    const targetMenu = document.getElementById(menuId);
    document.querySelectorAll('.dropdown-content').forEach(m => {
        if (m.id !== menuId) m.classList.remove('show');
    });
    targetMenu.classList.toggle("show");
};

window.addEventListener('click', (event) => {
    if (!event.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown-content').forEach(m => m.classList.remove('show'));
    }
    if (!event.target.closest('.chat-input-wrapper') && document.getElementById('emojiPanel').classList.contains('active')) {
        document.getElementById('emojiPanel').classList.remove('active');
    }
});

// ==================== سیستم جستجوی پیشرفته در چت ====================
window.openSearchBar = function() {
    document.querySelectorAll('.dropdown-content').forEach(m => m.classList.remove('show'));
    isSearchOpen = true;
    const bar = document.getElementById('chatSearchBar');
    bar.classList.add('active');
    const inp = document.getElementById('chatSearchInput');
    inp.value = '';
    document.getElementById('searchCounter').textContent = '';
    inp.focus();
};

window.closeSearchBar = function() {
    isSearchOpen = false;
    const bar = document.getElementById('chatSearchBar');
    if (bar) bar.classList.remove('active');
    const inp = document.getElementById('chatSearchInput');
    if (inp) {
        inp.value = '';
        inp.blur();
    }
    searchMatches = [];
    currentSearchIndex = -1;
    clearSearchHighlights();
};

function clearSearchHighlights() {
    document.querySelectorAll('.message-wrapper').forEach(w => {
        const docId = w.dataset.id;
        const msgData = cachedMessages.get(docId);
        const textEl = w.querySelector('.message-text');
        const msgEl = w.querySelector('.message');
        if (msgEl) msgEl.classList.remove('search-active-target');
        if (textEl && msgData) {
            textEl.textContent = msgData.text;
        }
    });
}

window.performChatSearch = function() {
    const queryStr = document.getElementById('chatSearchInput').value.trim();
    const counterEl = document.getElementById('searchCounter');
    clearSearchHighlights();
    searchMatches = [];
    currentSearchIndex = -1;

    if (!queryStr) {
        counterEl.textContent = '';
        return;
    }

    const escapedQuery = queryStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');

    document.querySelectorAll('.message-wrapper').forEach(w => {
        const docId = w.dataset.id;
        const msgData = cachedMessages.get(docId);
        if (!msgData || !msgData.text) return;

        if (msgData.text.toLowerCase().includes(queryStr.toLowerCase())) {
            searchMatches.push(docId);
            const textEl = w.querySelector('.message-text');
            if (textEl) {
                const safeHtml = escapeHtml(msgData.text).replace(regex, '<mark class="search-mark">$1</mark>');
                textEl.innerHTML = safeHtml;
            }
        }
    });

    if (searchMatches.length > 0) {
        currentSearchIndex = searchMatches.length - 1;
        focusSearchMatch();
    } else {
        counterEl.textContent = 'بدون نتیجه';
    }
};

window.navigateSearch = function(direction) {
    if (searchMatches.length === 0) return;
    currentSearchIndex += direction;
    if (currentSearchIndex < 0) currentSearchIndex = searchMatches.length - 1;
    if (currentSearchIndex >= searchMatches.length) currentSearchIndex = 0;
    focusSearchMatch();
};

function focusSearchMatch() {
    const counterEl = document.getElementById('searchCounter');
    counterEl.textContent = `${searchMatches.length - currentSearchIndex} از ${searchMatches.length}`;

    document.querySelectorAll('.message.search-active-target').forEach(el => el.classList.remove('search-active-target'));
    const targetId = searchMatches[currentSearchIndex];
    const targetEl = document.getElementById(`msg-${targetId}`);
    if (targetEl) {
        targetEl.classList.add('search-active-target');
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// ==================== سیستم انتخاب گروهی و حذف چندتایی (Multi-Select) ====================
window.enterSelectionMode = function(initialMsgId = null) {
    document.getElementById('actionModal').classList.remove('active');
    document.querySelectorAll('.dropdown-content').forEach(m => m.classList.remove('show'));
    isSelectionMode = true;
    selectedMsgIds.clear();
    if (initialMsgId) {
        selectedMsgIds.add(initialMsgId);
    }
    chatScreen.classList.add('selection-mode');
    document.getElementById('selectionBar').classList.add('active');
    updateSelectionUI();
    if (navigator.vibrate) navigator.vibrate(30);
};

window.exitSelectionMode = function() {
    isSelectionMode = false;
    selectedMsgIds.clear();
    chatScreen.classList.remove('selection-mode');
    document.getElementById('selectionBar').classList.remove('active');
    document.querySelectorAll('.message-wrapper.selected').forEach(el => el.classList.remove('selected'));
};

window.toggleMessageSelection = function(docId) {
    if (!isSelectionMode) return;
    if (selectedMsgIds.has(docId)) {
        selectedMsgIds.delete(docId);
    } else {
        selectedMsgIds.add(docId);
    }
    if (navigator.vibrate) navigator.vibrate(15);
    updateSelectionUI();
};

function updateSelectionUI() {
    document.querySelectorAll('.message-wrapper').forEach(w => {
        const id = w.dataset.id;
        w.classList.toggle('selected', selectedMsgIds.has(id));
    });
    const count = selectedMsgIds.size;
    document.getElementById('selectionCountText').textContent = count > 0 ? `${count} پیام انتخاب شده` : 'پیامی انتخاب نشده ';
    document.getElementById('bulkDeleteBtn').disabled = (count === 0);
    document.getElementById('bulkCopyBtn').disabled = (count === 0);
}

window.deleteSelectedMessages = async function() {
    const count = selectedMsgIds.size;
    if (count === 0) return;
    const btn = document.getElementById('bulkDeleteBtn');
    btn.disabled = true;
    const idsToDelete = Array.from(selectedMsgIds);
    exitSelectionMode();
    try {
        const { error } = await sb.from('messages').delete().in('id', idsToDelete);
        if (error) throw error;
        idsToDelete.forEach(id => cachedMessages.delete(id));
        renderChatMessages();
    } catch (err) {
        console.error(err);
        alert("خطا تو حذف برخی پیام‌ ها");
    }
};

window.copySelectedMessages = function() {
    if (selectedMsgIds.size === 0) return;
    const texts = [];
    document.querySelectorAll('.message-wrapper').forEach(w => {
        const id = w.dataset.id;
        if (selectedMsgIds.has(id)) {
            const data = cachedMessages.get(id);
            if (data && data.text) texts.push(data.text);
        }
    });
    navigator.clipboard.writeText(texts.join('\n')).catch(()=>{});
    exitSelectionMode();
};

// تنظیمات پروفایل من
window.openSettings = function() {
    document.querySelectorAll('.dropdown-content').forEach(m => m.classList.remove('show'));
    document.getElementById('settingsName').textContent = currentUser;
    document.getElementById('settingsBioInput').value = myProfileData.bio || "";
    document.getElementById('settingsProfilePic').style.backgroundImage = myProfileData.pic;
    const removeBtn = document.getElementById('removeProfilePicBtn');
    if (removeBtn) removeBtn.style.display = myProfileData.hasCustomPic ? 'inline-flex' : 'none';
    document.getElementById('settingsModal').classList.add('active');
};
window.closeSettings = function() { document.getElementById('settingsModal').classList.remove('active'); };
window.logout = function() {
    setOnlineStatus(false, true);
    localStorage.removeItem('chatUsername');
    location.reload();
};

// حذف تصویر پروفایل و بازگشت به آواتار پیش‌فرض
window.removeProfilePic = async function() {
    const removeBtn = document.getElementById('removeProfilePicBtn');
    const picDiv = document.getElementById('settingsProfilePic');
    if (removeBtn) removeBtn.disabled = true;
    picDiv.innerHTML = '<div class="avatar-loader"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';
    try {
        await upsertUserFields(currentUser, { profile_pic: null });
        myProfileData.pic = `url("${defaultAvatarSVG}")`;
        myProfileData.hasCustomPic = false;
        picDiv.style.backgroundImage = myProfileData.pic;
        document.getElementById('homeMyAvatar').style.backgroundImage = myProfileData.pic;
        document.getElementById('fileInput').value = '';
        if (removeBtn) removeBtn.style.display = 'none';
        if (window.refreshInstaAvatars) window.refreshInstaAvatars();
    } catch (e) {
        alert("خطا در حذف تصویر پروفایل.");
    } finally {
        picDiv.innerHTML = '';
        if (removeBtn) removeBtn.disabled = false;
    }
};

window.saveBio = async function() {
    const newBio = document.getElementById('settingsBioInput').value.trim();
    const btn = document.getElementById('saveBioBtn');
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> در حال ذخیرههه...';
    btn.disabled = true;
    try {
        await upsertUserFields(currentUser, { bio: newBio });
        myProfileData.bio = newBio;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> ذخیره شددددددد';
        btn.style.background = '#10b981';
        setTimeout(() => {
            btn.innerHTML = origText;
            btn.style.background = '';
            btn.disabled = false;
        }, 1800);
    } catch(e) {
        btn.innerHTML = 'خطا در ذخیره';
        btn.disabled = false;
    }
};

// آپلود عکس پروفایل Base64
document.getElementById('settingsProfilePic').addEventListener('click', () => document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const picDiv = document.getElementById('settingsProfilePic');
    const originalBg = picDiv.style.backgroundImage;
    picDiv.innerHTML = '<div class="avatar-loader"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 240;
            let width = img.width; let height = img.height;
            if (width > height) { if (width > MAX) { height *= MAX / width; width = MAX; } }
            else { if (height > MAX) { width *= MAX / height; height = MAX; } }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.72);

            upsertUserFields(currentUser, { profile_pic: dataUrl })
                .then(() => {
                    picDiv.innerHTML = '';
                    myProfileData.pic = `url(${dataUrl})`;
                    myProfileData.hasCustomPic = true;
                    picDiv.style.backgroundImage = myProfileData.pic;
                    document.getElementById('homeMyAvatar').style.backgroundImage = myProfileData.pic;
                    const removeBtn = document.getElementById('removeProfilePicBtn');
                    if (removeBtn) removeBtn.style.display = 'inline-flex';
                    if (window.refreshInstaAvatars) window.refreshInstaAvatars();
                })
                .catch(() => {
                    alert("خطا در آپلود تصویر.");
                    picDiv.innerHTML = '';
                    picDiv.style.backgroundImage = originalBg;
                });
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
});

// پروفایل پارتنر
window.openPartnerProfile = function() {
    let partnerName = (currentUser === "مهدی") ? "پارمیس" : "مهدی";
    document.getElementById('partnerProfileName').textContent = partnerName;
    document.getElementById('partnerProfileBio').textContent = partnerProfileData.bio || "بیووو نذاشتمم";
    document.getElementById('partnerProfilePic').style.backgroundImage = partnerProfileData.pic;
    document.getElementById('partnerProfileModal').classList.add('active');
};
window.closePartnerProfile = function() { document.getElementById('partnerProfileModal').classList.remove('active'); };

// پنل ایموجی
window.toggleEmojiPanel = function(e) {
    if (e) e.stopPropagation();
    const panel = document.getElementById('emojiPanel');
    panel.classList.toggle('active');
    if (panel.classList.contains('active')) {
        window.switchEmojiTab('emoji');
    }
};

window.switchEmojiTab = function(tabName) {
    document.querySelectorAll('.emoji-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.emoji-content-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('btn-' + tabName).classList.add('active');
    document.getElementById('pane-' + tabName).classList.add('active');
};

window.insertEmoji = function(emoji) {
    const inp = document.getElementById('messageInput');
    inp.value += emoji;
    inp.focus();
};

// ==================== اکشن‌های پیام: ریپلای، ویرایش، انتخاب چندتایی ====================
let selectedMessageId = null;
let selectedMessageLiked = false;
const actionModal = document.getElementById('actionModal');
const replyPreview = document.getElementById('replyPreview');

window.triggerReply = function(id, sender, text) {
    if (isSelectionMode) return;
    editingMessage = null;
    replyingTo = { id, sender, text };
    document.getElementById('replyPreviewIcon').className = 'fa-solid fa-reply reply-mode-icon';
    document.getElementById('replyPreviewSender').textContent = `پاسخ به ${sender}`;
    document.getElementById('replyPreviewText').textContent = text.length > 45 ? text.substring(0, 45) + '...' : text;
    document.getElementById('sendBtnIcon').className = 'fa-solid fa-paper-plane';
    replyPreview.classList.add('active');
    document.getElementById('messageInput').focus();
    if (navigator.vibrate) navigator.vibrate(35);
};

window.triggerEdit = function(id, text) {
    if (isSelectionMode) return;
    replyingTo = null;
    editingMessage = { id, text };
    document.getElementById('replyPreviewIcon').className = 'fa-solid fa-pen reply-mode-icon';
    document.getElementById('replyPreviewSender').textContent = 'در حال ویرایش کردنن پیام';
    document.getElementById('replyPreviewText').textContent = text.length > 45 ? text.substring(0, 45) + '...' : text;
    document.getElementById('sendBtnIcon').className = 'fa-solid fa-check';
    replyPreview.classList.add('active');
    const inp = document.getElementById('messageInput');
    inp.value = text;
    inp.focus();
    if (navigator.vibrate) navigator.vibrate(30);
};

window.cancelReplyOrEdit = function() {
    if (editingMessage) {
        document.getElementById('messageInput').value = '';
    }
    replyingTo = null;
    editingMessage = null;
    document.getElementById('sendBtnIcon').className = 'fa-solid fa-paper-plane';
    replyPreview.classList.remove('active');
};

window.showActions = function(id, isMe, sender, text, liked) {
    if (isSelectionMode) return;
    selectedMessageId = id;
    selectedMessageLiked = !!liked;

    document.getElementById('editActionBtn').style.display = isMe ? 'flex' : 'none';
    document.getElementById('deleteActionBtn').style.display = isMe ? 'flex' : 'none';
    document.getElementById('likeActionText').textContent = selectedMessageLiked ? 'برداشتن لایک' : 'لایک کردننن';

    document.getElementById('replyActionBtn').onclick = () => {
        triggerReply(id, sender, text);
        actionModal.classList.remove('active');
    };
    document.getElementById('editActionBtn').onclick = () => {
        triggerEdit(id, text);
        actionModal.classList.remove('active');
    };
    document.getElementById('selectActionBtn').onclick = () => {
        enterSelectionMode(id);
    };
    document.getElementById('likeActionBtn').onclick = async () => {
        const nextLiked = !selectedMessageLiked;
        actionModal.classList.remove('active');
        const msg = cachedMessages.get(id);
        if (msg) {
            msg.liked = nextLiked;
            renderChatMessages();
        }
        sb.from('messages').update({ liked: nextLiked }).eq('id', id).then(() => {}).catch(() => {});
    };
    document.getElementById('copyActionBtn').onclick = () => {
        navigator.clipboard.writeText(text).catch(()=>{});
        actionModal.classList.remove('active');
    };
    actionModal.classList.add('active');
};

window.cancelAction = function() { selectedMessageId = null; actionModal.classList.remove('active'); };

document.getElementById('deleteActionBtn').addEventListener('click', async () => {
    if (selectedMessageId) {
        const idToDelete = selectedMessageId;
        try {
            const { error } = await sb.from('messages').delete().eq('id', idToDelete);
            if (error) throw error;
            cachedMessages.delete(idToDelete);
            renderChatMessages();
            actionModal.classList.remove('active');
            selectedMessageId = null;
        } catch (error) { alert("خطا در حذف پیام"); }
    }
});

// لایک با دبل‌تپ
window.toggleLike = async function(msgId, currentStatus, msgElement) {
    if (isSelectionMode) return;
    const newStatus = !currentStatus;
    if (newStatus && msgElement) {
        const heart = document.createElement('div');
        heart.className = 'floating-heart-burst';
        heart.innerHTML = '<i class="fa-solid fa-heart"></i>';
        msgElement.appendChild(heart);
        if (navigator.vibrate) navigator.vibrate([25, 40, 25]);
        setTimeout(() => heart.remove(), 850);
    }
    const msg = cachedMessages.get(msgId);
    if (msg) {
        msg.liked = newStatus;
    }
    try {
        const { error } = await sb.from('messages').update({ liked: newStatus }).eq('id', msgId);
        if (error) throw error;
        renderChatMessages();
    } catch (error) { console.error(error); }
};

function extractUserSounds(userData) {
    if (!userData) return {};
    const s = (userData.sounds && typeof userData.sounds === 'object') ? userData.sounds : userData;
    return {
        randomSounds: s.randomSounds || userData.randomSounds || [],
        magic_doostet_daram: s.magic_doostet_daram || s.magicSoundLove || userData.magic_doostet_daram || null,
        magic_asheghetam: s.magic_asheghetam || userData.magic_asheghetam || null,
        magic_cute: s.magic_cute || userData.magic_cute || null,
        magic_ghalbe_mania: s.magic_ghalbe_mania || userData.magic_ghalbe_mania || null,
        magic_nafase_mania: s.magic_nafase_mania || userData.magic_nafase_mania || null,
        magic_fereshteh: s.magic_fereshteh || userData.magic_fereshteh || null
    };
}

// ==================== ۱. سیستم دفترچه خاطرات (Slide-up Notebook) ====================
let cachedMemories = new Map();
let editingMemoryId = null;

window.openNotebookSheet = function() {
    document.getElementById('notebookSheet').classList.add('active');
    if (navigator.vibrate) navigator.vibrate(15);
};

window.closeNotebookSheet = function() {
    const sheet = document.getElementById('notebookSheet');
    if (sheet) sheet.classList.remove('active');
    closeNotebookEditor();
};

window.openNotebookEditor = function(memId = null) {
    const editorBox = document.getElementById('notebookEditorBox');
    const titleInp = document.getElementById('memoryTitleInp');
    const textInp = document.getElementById('memoryTextInp');
    const submitBtnSpan = document.getElementById('saveMemoryBtnText');

    if (memId && cachedMemories.has(memId)) {
        const data = cachedMemories.get(memId);
        editingMemoryId = memId;
        titleInp.value = data.title || '';
        textInp.value = data.text || '';
        submitBtnSpan.textContent = 'ذخیره تغییرات بچم';
    } else {
        editingMemoryId = null;
        titleInp.value = '';
        textInp.value = '';
        submitBtnSpan.textContent = 'ثبت تو دفترچه خاطرات';
    }
    editorBox.classList.add('active');
    setTimeout(() => titleInp.focus(), 120);
};

window.closeNotebookEditor = function() {
    editingMemoryId = null;
    const editorBox = document.getElementById('notebookEditorBox');
    if (editorBox) editorBox.classList.remove('active');
    const titleInp = document.getElementById('memoryTitleInp');
    const textInp = document.getElementById('memoryTextInp');
    if (titleInp) titleInp.value = '';
    if (textInp) textInp.value = '';
};

function getFullPersianDate(dateObj) {
    try {
        return new Intl.DateTimeFormat('fa-IR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }).format(dateObj || new Date());
    } catch (e) {
        return new Date().toLocaleDateString('fa-IR');
    }
}

window.saveMemory = async function() {
    const titleInp = document.getElementById('memoryTitleInp');
    const textInp = document.getElementById('memoryTextInp');
    const btn = document.getElementById('saveMemoryBtn');
    const title = titleInp.value.trim();
    const text = textInp.value.trim();

    if (!title && !text) return;

    btn.disabled = true;
    try {
        if (editingMemoryId) {
            const { data, error } = await sb
                .from('memories')
                .update({
                    title: title || 'بدون عنوان',
                    text: text,
                    edited: true
                })
                .eq('id', editingMemoryId)
                .select()
                .single();
            if (error) throw error;
            if (data) cachedMemories.set(data.id, mapMemoryRow(data));
        } else {
            const newId = generateDocId('mem');
            const newRow = {
                id: newId,
                title: title || 'خاطره مشترک',
                text: text,
                author: currentUser,
                date_string: getFullPersianDate(new Date()),
                edited: false,
                created_at: new Date().toISOString()
            };
            const { error } = await sb.from('memories').insert(newRow);
            if (error) throw error;
            cachedMemories.set(newId, mapMemoryRow(newRow));
        }
        renderMemoriesList();
        closeNotebookEditor();
    } catch (err) {
        console.error(err);
        alert("خطا در ذخیره خاطره.");
    } finally {
        btn.disabled = false;
    }
};

window.deleteMemoryEntry = async function(memId) {
    if (!confirm("مطمعنی میخوای این خاطره رو حذف کنی؟؟ نکنننن")) return;
    try {
        const { error } = await sb.from('memories').delete().eq('id', memId);
        if (error) throw error;
        cachedMemories.delete(memId);
        renderMemoriesList();
    } catch (err) {
        console.error(err);
        alert("خطا در حذف خاطره.");
    }
};

function renderMemoriesList() {
    const memoriesListEl = document.getElementById('memoriesList');
    const homeMemoriesCount = document.getElementById('homeMemoriesCount');
    const homeMemoriesSubtitle = document.getElementById('homeMemoriesSubtitle');
    if (!memoriesListEl) return;

    memoriesListEl.innerHTML = '';
    const sorted = Array.from(cachedMemories.values()).sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const total = sorted.length;
    if (homeMemoriesCount) {
        homeMemoriesCount.textContent = total > 0 ? `${total} خاطره` : 'جدید';
    }

    if (total === 0) {
        if (homeMemoriesSubtitle) homeMemoriesSubtitle.textContent = 'ثبت لحظات قشنگمون';
        memoriesListEl.innerHTML = `
            <div class="sheet-empty-state">
                <div class="sheet-empty-icon"><i class="fa-solid fa-book-open-reader"></i></div>
                <p>هنوز خاطره ‌ای تو دفترچه ثبت نشده دورت بگردم</p>
                <span>روی دکمه «+ خاطره جدید» توو بالا بزن خوشگل من مهدی فدات بشه بعد اولین صفحه دفترچه رو بنویس</span>
            </div>
        `;
        return;
    }

    let firstTitle = null;
    sorted.forEach((data) => {
        const memId = data.id;
        if (!firstTitle) firstTitle = data.title || data.text;

        let dateDisplay = data.dateString || '';
        if (!dateDisplay && data.dateObj) {
            dateDisplay = getFullPersianDate(data.dateObj);
        }
        let timeDisplay = '';
        if (data.dateObj) {
            timeDisplay = data.dateObj.getHours().toString().padStart(2, '0') + ':' + data.dateObj.getMinutes().toString().padStart(2, '0');
        }

        const pageCard = document.createElement('article');
        pageCard.className = 'notebook-page-card';
        pageCard.innerHTML = `
            <div class="notebook-holes">
                <span></span><span></span><span></span>
            </div>
            <div class="notebook-page-header">
                <div class="notebook-meta-right">
                    <span class="notebook-date-badge"><i class="fa-regular fa-calendar"></i> ${escapeHtml(dateDisplay)}${timeDisplay ? ' • ' + timeDisplay : ''}</span>
                    <span class="notebook-author-badge">به قلم ${escapeHtml(data.author || '')}${data.edited ? ' (ویرایش شده)' : ''}</span>
                </div>
                <div class="notebook-actions">
                    <button type="button" class="notebook-icon-btn" title="ویرایش خاطره" onclick="openNotebookEditor('${memId}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button type="button" class="notebook-icon-btn danger" title="حذف خاطره" onclick="deleteMemoryEntry('${memId}')">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                </div>
            </div>
            <h4 class="notebook-page-title">${escapeHtml(data.title || 'خاطره')}</h4>
            <div class="notebook-page-body">${escapeHtml(data.text || '')}</div>
        `;
        memoriesListEl.appendChild(pageCard);
    });

    if (homeMemoriesSubtitle && firstTitle) {
        homeMemoriesSubtitle.textContent = firstTitle;
    }
}

// ==================== ۲. سیستم کارایی که باید انجام بدیم (Grouped To-Do) ====================
let cachedTodoCategories = new Map();
let editingCategoryId = null;

window.openTodoSheet = function() {
    document.getElementById('todoSheet').classList.add('active');
    if (navigator.vibrate) navigator.vibrate(15);
};

window.closeTodoSheet = function() {
    const sheet = document.getElementById('todoSheet');
    if (sheet) sheet.classList.remove('active');
    cancelCategoryRename();
};

window.addTodoCategory = async function() {
    const inp = document.getElementById('newCategoryTitleInp');
    const btn = document.getElementById('addCategoryBtn');
    const title = inp.value.trim();
    if (!title) return;

    btn.disabled = true;
    try {
        if (editingCategoryId) {
            const { data, error } = await sb
                .from('todo_categories')
                .update({ title })
                .eq('id', editingCategoryId)
                .select()
                .single();
            if (error) throw error;
            if (data) cachedTodoCategories.set(data.id, mapTodoRow(data));
            cancelCategoryRename();
        } else {
            inp.value = '';
            const newId = generateDocId('cat');
            const newRow = {
                id: newId,
                title: title,
                created_by: currentUser,
                items: [],
                created_at: new Date().toISOString()
            };
            const { error } = await sb.from('todo_categories').insert(newRow);
            if (error) throw error;
            cachedTodoCategories.set(newId, mapTodoRow(newRow));
        }
        renderTodoCategoriesList();
    } catch (err) {
        console.error(err);
        alert("خطا در ثبت سرفصل.");
    } finally {
        btn.disabled = false;
    }
};

window.startCategoryRename = function(catId) {
    const data = cachedTodoCategories.get(catId);
    if (!data) return;
    editingCategoryId = catId;
    const inp = document.getElementById('newCategoryTitleInp');
    const btnSpan = document.getElementById('addCategoryBtnText');
    const cancelBtn = document.getElementById('cancelCategoryEditBtn');
    inp.value = data.title || '';
    btnSpan.textContent = 'ذخیره اسمم';
    cancelBtn.style.display = 'inline-flex';
    inp.focus();
};

window.cancelCategoryRename = function() {
    editingCategoryId = null;
    const inp = document.getElementById('newCategoryTitleInp');
    const btnSpan = document.getElementById('addCategoryBtnText');
    const cancelBtn = document.getElementById('cancelCategoryEditBtn');
    if (inp) inp.value = '';
    if (btnSpan) btnSpan.textContent = 'سرفصل جدید';
    if (cancelBtn) cancelBtn.style.display = 'none';
};

window.deleteTodoCategory = async function(catId) {
    if (!confirm("این سرفصل و تموومم کار های داخلش حذف بشن؟؟؟")) return;
    try {
        if (editingCategoryId === catId) cancelCategoryRename();
        const { error } = await sb.from('todo_categories').delete().eq('id', catId);
        if (error) throw error;
        cachedTodoCategories.delete(catId);
        renderTodoCategoriesList();
    } catch (err) {
        console.error(err);
        alert("خطا در حذف سرفصل.");
    }
};

window.addTodoItem = async function(catId) {
    const inp = document.getElementById(`todo-inp-${catId}`);
    if (!inp) return;
    const text = inp.value.trim();
    if (!text) return;

    const catData = cachedTodoCategories.get(catId);
    if (!catData) return;

    inp.value = '';
    const currentItems = Array.isArray(catData.items) ? [...catData.items] : [];
    const newItem = {
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        text: text,
        done: false,
        addedBy: currentUser
    };
    currentItems.push(newItem);
    catData.items = currentItems;
    renderTodoCategoriesList();

    try {
        const { error } = await sb.from('todo_categories').update({ items: currentItems }).eq('id', catId);
        if (error) throw error;
    } catch (err) {
        console.error(err);
    }
};

window.toggleTodoItem = async function(catId, itemId) {
    const catData = cachedTodoCategories.get(catId);
    if (!catData || !Array.isArray(catData.items)) return;

    const updatedItems = catData.items.map(item => {
        if (item.id === itemId) {
            return { ...item, done: !item.done };
        }
        return item;
    });
    catData.items = updatedItems;
    renderTodoCategoriesList();

    if (navigator.vibrate) navigator.vibrate(20);
    try {
        const { error } = await sb.from('todo_categories').update({ items: updatedItems }).eq('id', catId);
        if (error) throw error;
    } catch (err) {
        console.error(err);
    }
};

window.deleteTodoItem = async function(catId, itemId) {
    const catData = cachedTodoCategories.get(catId);
    if (!catData || !Array.isArray(catData.items)) return;

    const updatedItems = catData.items.filter(item => item.id !== itemId);
    catData.items = updatedItems;
    renderTodoCategoriesList();
    try {
        const { error } = await sb.from('todo_categories').update({ items: updatedItems }).eq('id', catId);
        if (error) throw error;
    } catch (err) {
        console.error(err);
    }
};

function renderTodoCategoriesList() {
    const todoCategoriesListEl = document.getElementById('todoCategoriesList');
    const homeTodoCount = document.getElementById('homeTodoCount');
    const homeTodoSubtitle = document.getElementById('homeTodoSubtitle');
    if (!todoCategoriesListEl) return;

    todoCategoriesListEl.innerHTML = '';
    const sorted = Array.from(cachedTodoCategories.values()).sort((a, b) => {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    let totalTasks = 0;
    let doneTasks = 0;

    if (sorted.length === 0) {
        if (homeTodoCount) homeTodoCount.textContent = '0/0';
        if (homeTodoSubtitle) homeTodoSubtitle.textContent = 'لیست برنامه‌ ها و آرزوها';
        todoCategoriesListEl.innerHTML = `
            <div class="sheet-empty-state">
                <div class="sheet-empty-icon"><i class="fa-solid fa-list-check"></i></div>
                <p>هنوز سرفصلی ساخته نشدههه</p>
                <span>از کادر بالا اولین سرفصل (مثلا «جاهایی که باید بریم» یا «کارایی که باید بکنیم») رو میتونیم بسازیم</span>
            </div>
        `;
        return;
    }

    sorted.forEach((data) => {
        const catId = data.id;
        const items = Array.isArray(data.items) ? data.items : [];
        const catTotal = items.length;
        const catDone = items.filter(i => i.done).length;
        totalTasks += catTotal;
        doneTasks += catDone;

        const catCard = document.createElement('div');
        catCard.className = 'todo-category-card';

        const itemsHtml = items.length === 0
            ? `<div class="todo-empty-items">موردی تو این سرفصل ثبت نشده </div>`
            : items.map(item => `
                <div class="todo-item-row ${item.done ? 'done' : ''}" onclick="toggleTodoItem('${catId}', '${item.id}')">
                    <button type="button" class="todo-checkbox ${item.done ? 'checked' : ''}">
                        <i class="fa-solid fa-check"></i>
                    </button>
                    <div class="todo-item-content">
                        <span class="todo-item-text">${escapeHtml(item.text)}</span>
                    </div>
                    <button type="button" class="todo-item-del" title="حذف این مورد" onclick="event.stopPropagation(); deleteTodoItem('${catId}', '${item.id}')">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `).join('');

        catCard.innerHTML = `
            <div class="todo-cat-header">
                <div class="todo-cat-title-group">
                    <span class="todo-cat-dot"></span>
                    <h4 class="todo-cat-title">${escapeHtml(data.title || 'سرفصل')}</h4>
                    <span class="todo-cat-badge">${catDone}/${catTotal}</span>
                </div>
                <div class="todo-cat-actions">
                    <button type="button" class="todo-cat-btn" title="تغییر نام سرفصل" onclick="startCategoryRename('${catId}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button type="button" class="todo-cat-btn danger" title="حذف سرفصل" onclick="deleteTodoCategory('${catId}')">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                </div>
            </div>
            <div class="todo-items-container">
                ${itemsHtml}
            </div>
            <div class="todo-add-item-bar">
                <input type="text" id="todo-inp-${catId}" class="todo-add-input" placeholder="افزودن کار جدید به «${escapeHtml(data.title || '')}»..." autocomplete="off">
                <button type="button" class="todo-add-btn" onclick="addTodoItem('${catId}')" title="افزودن">
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>
        `;
        todoCategoriesListEl.appendChild(catCard);

        const catInp = catCard.querySelector(`#todo-inp-${catId}`);
        if (catInp) {
            catInp.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') addTodoItem(catId);
            });
        }
    });

    if (homeTodoCount) {
        homeTodoCount.textContent = `${doneTasks}/${totalTasks}`;
    }
    if (homeTodoSubtitle) {
        if (totalTasks === 0) {
            homeTodoSubtitle.textContent = `${sorted.length} سرفصل آماده`;
        } else {
            homeTodoSubtitle.textContent = `${doneTasks} از ${totalTasks} انجام شده`;
        }
    }
}

// ==================== ۳. سیستم نصب بومی (PWA)، آپدیت خودکار (OTA) و نوتیفیکیشن محلی — نسخه ۱۸ (Supabase) ====================
const CURRENT_APP_VERSION = '20.2';
let deferredInstallPrompt = window.__earlyInstallPrompt || null;
let waitingServiceWorker = null;

function syncInstallMenuItemVisibility() {
    const installItem = document.getElementById('installAppMenuItem');
    if (installItem && deferredInstallPrompt) {
        installItem.style.display = 'flex';
    }
}
syncInstallMenuItemVisibility();

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    window.__earlyInstallPrompt = e;
    syncInstallMenuItemVisibility();
});

window.triggerPwaInstall = async function() {
    document.querySelectorAll('.dropdown-content').forEach(m => m.classList.remove('show'));
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
            const installItem = document.getElementById('installAppMenuItem');
            if (installItem) installItem.style.display = 'none';
        }
        deferredInstallPrompt = null;
    } else {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isIOS) {
            alert("نصب");
        } else {
            alert("قلبم اپلیکیشن الان نصب شده یا میتونی از منوی مرورگرت گزینه install app رو انتخاب کنی دورت بگردم");
        }
    }
};

window.showUpdateBanner = function() {
    const banner = document.getElementById('otaUpdateBanner');
    if (banner) banner.classList.add('active');
};

window.dismissUpdateBanner = function() {
    const banner = document.getElementById('otaUpdateBanner');
    if (banner) banner.classList.remove('active');
};

window.applyAppUpdate = function() {
    window.dismissUpdateBanner();
    if (waitingServiceWorker) {
        waitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
        waitingServiceWorker = null;
        setTimeout(() => window.location.reload(), 300);
    } else if ('caches' in window) {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => {
            window.location.reload();
        });
    } else {
        window.location.reload();
    }
};

window.checkForUpdatesManual = async function() {
    document.querySelectorAll('.dropdown-content').forEach(m => m.classList.remove('show'));
    if ('serviceWorker' in navigator) {
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
                await reg.update();
                if (reg.waiting || reg.installing) {
                    waitingServiceWorker = reg.waiting || reg.installing;
                    window.showUpdateBanner();
                    return;
                }
            }
        } catch (e) {
            console.warn(e);
        }
    }
    alert("اخرین اپدیت انجامم دادم فعلا این اخرین نسخس");
};

// بروزرسانی وضعیت ظاهری آیکون زنگوله نوتیفیکیشن
function updateNotificationStatusUI() {
    const dot = document.getElementById('notifStatusDot');
    const menuText = document.getElementById('notifMenuText');
    const bellBtn = document.getElementById('homeNotifBtn');
    if (!('Notification' in window)) {
        if (dot) dot.className = 'notif-status-dot denied';
        return;
    }
    const perm = Notification.permission;
    if (perm === 'granted') {
        if (dot) dot.className = 'notif-status-dot enabled';
        if (menuText) menuText.textContent = 'نوتیفیکیشن فعاله ✨';
        if (bellBtn) bellBtn.innerHTML = '<i class="fa-solid fa-bell" style="color: #4f46e5;"></i><span id="notifStatusDot" class="notif-status-dot enabled"></span>';
    } else if (perm === 'denied') {
        if (dot) dot.className = 'notif-status-dot denied';
        if (menuText) menuText.textContent = 'نوتیفیکیشن مسدود شده';
    } else {
        if (dot) dot.className = 'notif-status-dot';
        if (menuText) menuText.textContent = 'فعال‌سازی نوتیفیکیشن';
    }
}

// فعال‌سازی نوتیفیکیشن گوشی (بدون وابستگی به فایربیس تا در ایران بدون فیلترشکن کار کند)
window.enablePushNotifications = async function(silent = false) {
    document.querySelectorAll('.dropdown-content').forEach(m => m.classList.remove('show'));

    if (!('Notification' in window)) {
        if (!silent) {
            alert("برای دریافت نوتیفیکیشن روی آیفون، اول برنامه رو Add to Home Screen کن و از صفحه اصلی گوشیت بازش کن نفسم 💙");
        }
        return;
    }

    try {
        let permission = Notification.permission;
        if (permission !== 'granted') {
            permission = await Notification.requestPermission();
        }
        updateNotificationStatusUI();

        if (permission !== 'granted') {
            if (!silent) {
                alert("اجازه نوتیفیکیشن داده نشد. از تنظیمات مرورگر یا گوشی می‌تونی فعالش کنی.");
            }
            return;
        }

        if (currentUser) {
            upsertUserFields(currentUser, { notif_updated_at: new Date().toISOString() }).catch(() => {});
        }

        if (!silent) {
            dispatchLocalSystemNotification("نوتیفیکیشن فعال شد! 🔔", "از الان هر پیام یا پست جدیدی بیاد رو صفحه گوشیت باخبر میشی 💙", "notif-test", "home", true);
        }
    } catch (err) {
        console.error(err);
    }
};

// ارسال نوتیفیکیشن واقعی روی صفحه گوشی از طریق سرویس‌ورکر
async function dispatchLocalSystemNotification(title, body, tag = 'parmis-notif', targetView = 'chat', forceShow = false) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    if (!forceShow && document.visibilityState === 'visible') {
        if (targetView === 'chat' && activeScreen === 'chat') return;
        if (targetView === 'insta' && document.getElementById('instaSheet')?.classList.contains('active')) return;
    }

    try {
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg && reg.active) {
                reg.active.postMessage({
                    type: 'SHOW_NOTIFICATION',
                    title: title,
                    body: body,
                    tag: tag,
                    targetView: targetView
                });
                return;
            }
        }
        new Notification(title, { body: body, dir: 'rtl', lang: 'fa', tag: tag });
    } catch (e) {
        console.warn("Notification trigger warning:", e);
    }
}

function initServiceWorkerAndOta() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
            if (reg.waiting) {
                waitingServiceWorker = reg.waiting;
                window.showUpdateBanner();
            }
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        waitingServiceWorker = newWorker;
                        window.showUpdateBanner();
                    }
                });
            });
        }).catch(err => console.warn('SW registration skipped:', err));

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });

        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'OPEN_TARGET_VIEW') {
                const view = event.data.targetView;
                if (view === 'chat') window.openChatView?.();
                else if (view === 'insta') { window.openHomeView?.(); window.openInstaSheet?.(); }
                else if (view === 'memories') { window.openHomeView?.(); window.openNotebookSheet?.(); }
                else if (view === 'study') { window.openHomeView?.(); window.openStudySheet?.(); }
            }
        });
    }
    updateNotificationStatusUI();
}
initServiceWorkerAndOta();

// ==================== ۴. سیستم مینی‌اینستاگرام دونفره (پست آلبومی چندعکسی + ویدیو با Cloudinary و ImgBB) ====================
const IMGBB_API_KEY_RAW = 'Beefd738dc7768e90ec730d58a74d66c';
const CLOUDINARY_CLOUD_NAMES = ['itxygqa4', 'Itxygqa4'];
const CLOUDINARY_UPLOAD_PRESET = 'parmischat1202';

let cachedInstaPosts = new Map();
let selectedInstaMediaList = []; // آرایه‌ای از { id, type: 'image'|'video', file, previewUrl, dataUrl }

let instaVideoObserver = null;
if ('IntersectionObserver' in window) {
    instaVideoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const vid = entry.target;
            if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
                vid.play().catch(() => {});
            } else {
                vid.pause();
            }
        });
    }, { threshold: [0.2, 0.55, 0.8] });
}

window.hasSelectedInstaMedia = function() {
    return selectedInstaMediaList.length > 0;
};

window.openInstaSheet = function() {
    document.getElementById('instaSheet').classList.add('active');
    if (navigator.vibrate) navigator.vibrate(15);
};

window.closeInstaSheet = function() {
    const sheet = document.getElementById('instaSheet');
    if (sheet) sheet.classList.remove('active');
    document.querySelectorAll('#instaFeedList video').forEach(v => v.pause());
    window.closeInstaPostCreator();
};

window.openInstaPostCreator = function() {
    const box = document.getElementById('instaCreatorBox');
    if (box) box.classList.add('active');
    const body = document.querySelector('#instaSheet .sheet-body');
    if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
};

window.clearSelectedInstaMedia = function() {
    selectedInstaMediaList.forEach(item => {
        if (item.previewUrl && item.previewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(item.previewUrl);
        }
    });
    selectedInstaMediaList = [];
    const fileInp = document.getElementById('instaFileInput');
    if (fileInp) fileInp.value = '';
    renderInstaCreatorPreview();
};

window.removeSelectedInstaSlide = function(slideId) {
    const target = selectedInstaMediaList.find(i => i.id === slideId);
    if (target && target.previewUrl && target.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(target.previewUrl);
    }
    selectedInstaMediaList = selectedInstaMediaList.filter(i => i.id !== slideId);
    renderInstaCreatorPreview();
};

window.closeInstaPostCreator = function() {
    window.clearSelectedInstaMedia();
    const box = document.getElementById('instaCreatorBox');
    if (box) box.classList.remove('active');
    const capInp = document.getElementById('instaCaptionInp');
    if (capInp) capInp.value = '';
    const statusEl = document.getElementById('instaUploadStatus');
    if (statusEl) statusEl.style.display = 'none';
};

function renderInstaCreatorPreview() {
    const placeholder = document.getElementById('instaPickerPlaceholder');
    const previewImg = document.getElementById('instaPreviewImg');
    const carouselEl = document.getElementById('instaPreviewCarousel');
    const toolbarEl = document.getElementById('instaSelectedToolbar');
    const countEl = document.getElementById('instaSelectedCount');

    if (previewImg) {
        previewImg.src = '';
        previewImg.style.display = 'none';
    }

    if (selectedInstaMediaList.length === 0) {
        if (placeholder) placeholder.style.display = 'flex';
        if (carouselEl) {
            carouselEl.innerHTML = '';
            carouselEl.style.display = 'none';
        }
        if (toolbarEl) toolbarEl.style.display = 'none';
        return;
    }

    if (placeholder) placeholder.style.display = 'none';
    if (toolbarEl) toolbarEl.style.display = 'flex';
    if (countEl) {
        countEl.textContent = `${selectedInstaMediaList.length} اسلاید آماده آپلود`;
    }

    if (carouselEl) {
        carouselEl.style.display = 'flex';
        carouselEl.innerHTML = selectedInstaMediaList.map((item, idx) => {
            const mediaHtml = item.type === 'video'
                ? `<video src="${item.previewUrl}" muted loop playsinline autoplay></video>`
                : `<img src="${item.previewUrl}" alt="Slide ${idx + 1}">`;
            const badgeIcon = item.type === 'video' ? 'fa-video' : 'fa-image';
            return `
                <div class="insta-preview-slide" onclick="event.stopPropagation()">
                    ${mediaHtml}
                    <span class="insta-preview-badge">
                        <i class="fa-solid ${badgeIcon}"></i>
                        <span>${idx + 1}/${selectedInstaMediaList.length}</span>
                    </span>
                    <button type="button" class="insta-preview-remove-btn" title="حذف این اسلاید" onclick="event.stopPropagation(); removeSelectedInstaSlide('${item.id}')">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
        }).join('');
    }
}

function compressImageForInsta(file, maxDim = 1080, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > maxDim) {
                        height = Math.round(height * (maxDim / width));
                        width = maxDim;
                    }
                } else {
                    if (height > maxDim) {
                        width = Math.round(width * (maxDim / height));
                        height = maxDim;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

const instaFileInputEl = document.getElementById('instaFileInput');
if (instaFileInputEl) {
    instaFileInputEl.addEventListener('change', async function(e) {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        for (const file of files) {
            if (selectedInstaMediaList.length >= 10) {
                alert("حداکثر ۱۰ عکس و ویدیو در یک پست آلبومی می‌تونی بذاری نفسم ✨");
                break;
            }
            const isVideo = file.type.startsWith('video/');
            const slideId = 'slide_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

            if (isVideo) {
                const blobUrl = URL.createObjectURL(file);
                selectedInstaMediaList.push({
                    id: slideId,
                    type: 'video',
                    file: file,
                    previewUrl: blobUrl,
                    dataUrl: null
                });
            } else {
                try {
                    const dataUrl = await compressImageForInsta(file, 1080, 0.82);
                    selectedInstaMediaList.push({
                        id: slideId,
                        type: 'image',
                        file: file,
                        previewUrl: dataUrl,
                        dataUrl: dataUrl
                    });
                } catch (err) {
                    console.error(err);
                }
            }
        }
        e.target.value = '';
        renderInstaCreatorPreview();
    });
}

async function uploadBase64ToImgBB(dataUrl) {
    const base64Image = dataUrl.split(',')[1];
    const keysToTry = [IMGBB_API_KEY_RAW.toLowerCase(), IMGBB_API_KEY_RAW];

    for (const apiKey of keysToTry) {
        try {
            const formData = new FormData();
            formData.append('image', base64Image);
            const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
                method: 'POST',
                body: formData
            });
            const json = await res.json();
            if (json && json.success && json.data && json.data.url) {
                return json.data.display_url || json.data.url;
            }
        } catch (err) {
            console.warn('ImgBB attempt error:', err);
        }
    }
    return null;
}

async function uploadMediaToCloudinary(fileOrDataUrl, resourceType = 'auto') {
    for (const cloudName of CLOUDINARY_CLOUD_NAMES) {
        try {
            const formData = new FormData();
            formData.append('file', fileOrDataUrl);
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

            const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
                method: 'POST',
                body: formData
            });
            const json = await res.json();
            if (json && json.secure_url) {
                if (resourceType === 'video' || json.resource_type === 'video') {
                    return json.secure_url.replace('/upload/', '/upload/q_auto,f_auto/');
                }
                return json.secure_url;
            }
        } catch (err) {
            console.warn(`Cloudinary attempt (${cloudName}) error:`, err);
        }
    }
    return null;
}

window.publishInstaPost = async function() {
    if (selectedInstaMediaList.length === 0) {
        alert("نفسم اول یه عکس از گالری انتخاب کن");
        return;
    }
    const captionInp = document.getElementById('instaCaptionInp');
    const publishBtn = document.getElementById('publishInstaBtn');
    const statusEl = document.getElementById('instaUploadStatus');
    const statusTextEl = document.getElementById('instaUploadStatusText');
    const caption = captionInp ? captionInp.value.trim() : '';

    publishBtn.disabled = true;
    if (statusEl) statusEl.style.display = 'flex';

    try {
        const uploadedMediaItems = [];
        const total = selectedInstaMediaList.length;

        for (let i = 0; i < total; i++) {
            const item = selectedInstaMediaList[i];
            if (statusTextEl) {
                statusTextEl.textContent = total > 1
                    ? `درحال اپلود اسلاید ${i + 1} از ${total} هیهیهیهییهییهییی...`
                    : (item.type === 'video' ? 'درحال اپلود ویدیو هیهیهیهییهییهییی...' : 'درحال اپلود عکس هیهیهیهییهییهییی...');
            }

            if (item.type === 'video') {
                const videoUrl = await uploadMediaToCloudinary(item.file, 'video');
                if (!videoUrl) {
                    throw new Error("VIDEO_UPLOAD_FAILED");
                }
                uploadedMediaItems.push({ type: 'video', url: videoUrl });
            } else {
                let imgUrl = await uploadBase64ToImgBB(item.dataUrl);
                if (!imgUrl) {
                    imgUrl = await uploadMediaToCloudinary(item.dataUrl, 'image');
                }
                if (!imgUrl) {
                    imgUrl = item.dataUrl;
                }
                uploadedMediaItems.push({ type: 'image', url: imgUrl });
            }
        }

        const newId = generateDocId('post');
        const newRow = {
            id: newId,
            image_url: uploadedMediaItems[0].url,
            media_items: uploadedMediaItems,
            caption: caption,
            author: currentUser,
            date_string: getFullPersianDate(new Date()),
            likes: [],
            comments: [],
            created_at: new Date().toISOString()
        };

        const { error } = await sb.from('insta_posts').insert(newRow);
        if (error) throw error;

        cachedInstaPosts.set(newId, mapInstaRow(newRow));
        notifiedInstaIds.add(newId);
        renderInstaFeedList();

        window.closeInstaPostCreator();
        if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
    } catch (err) {
        console.error(err);
        if (err && err.message === "VIDEO_UPLOAD_FAILED") {
            alert("خطا در آپلود ویدیو به کلودینری! مطمئن شو اینترنتت وصله و پریست parmischat1202 روی حالت Unsigned قرار داره.");
        } else {
            alert("خطا در انتشار پست.");
        }
    } finally {
        publishBtn.disabled = false;
        if (statusEl) statusEl.style.display = 'none';
    }
};

window.toggleInstaVideoMute = function(event, btnEl) {
    if (event) event.stopPropagation();
    const slideEl = btnEl.closest('.insta-carousel-slide');
    const videoEl = slideEl ? slideEl.querySelector('video') : null;
    if (!videoEl) return;

    videoEl.muted = !videoEl.muted;
    btnEl.innerHTML = videoEl.muted
        ? '<i class="fa-solid fa-volume-xmark"></i>'
        : '<i class="fa-solid fa-volume-high"></i>';
};

window.openInstaFullscreen = function(type, url) {
    const modal = document.getElementById('instaFullscreenModal');
    const content = document.getElementById('instaFullscreenContent');
    if (!modal || !content) return;

    document.querySelectorAll('#instaFeedList video').forEach(v => v.pause());

    if (type === 'video') {
        content.innerHTML = `<video src="${escapeHtml(url)}" controls autoplay playsinline style="width:100%; max-height:86dvh; border-radius:16px;"></video>`;
    } else {
        content.innerHTML = `<img src="${escapeHtml(url)}" alt="Fullscreen Media">`;
    }
    modal.classList.add('active');
};

window.closeInstaFullscreen = function() {
    const modal = document.getElementById('instaFullscreenModal');
    const content = document.getElementById('instaFullscreenContent');
    if (content) content.innerHTML = '';
    if (modal) modal.classList.remove('active');
};

window.toggleInstaLike = async function(postId, mediaWrapEl = null, forceLike = false) {
    const postData = cachedInstaPosts.get(postId);
    if (!postData) return;

    const currentLikes = Array.isArray(postData.likes) ? [...postData.likes] : [];
    const hasLiked = currentLikes.includes(currentUser);

    if (forceLike && mediaWrapEl) {
        const heart = document.createElement('div');
        heart.className = 'floating-heart-burst';
        heart.innerHTML = '<i class="fa-solid fa-heart"></i>';
        mediaWrapEl.appendChild(heart);
        setTimeout(() => heart.remove(), 850);
    }

    if (forceLike && hasLiked) {
        if (navigator.vibrate) navigator.vibrate(20);
        return;
    }

    let updatedLikes;
    if (hasLiked) {
        updatedLikes = currentLikes.filter(u => u !== currentUser);
    } else {
        updatedLikes = [...currentLikes, currentUser];
        if (navigator.vibrate) navigator.vibrate([25, 40, 25]);
    }

    postData.likes = updatedLikes;
    renderInstaFeedList();

    try {
        const { error } = await sb.from('insta_posts').update({ likes: updatedLikes }).eq('id', postId);
        if (error) throw error;
    } catch (err) {
        console.error(err);
    }
};

window.addInstaComment = async function(postId) {
    const inp = document.getElementById(`insta-comment-inp-${postId}`);
    if (!inp) return;
    const text = inp.value.trim();
    if (!text) return;

    const postData = cachedInstaPosts.get(postId);
    if (!postData) return;

    inp.value = '';
    const currentComments = Array.isArray(postData.comments) ? [...postData.comments] : [];
    currentComments.push({
        id: 'cmt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        author: currentUser,
        text: text
    });
    postData.comments = currentComments;
    renderInstaFeedList();

    try {
        const { error } = await sb.from('insta_posts').update({ comments: currentComments }).eq('id', postId);
        if (error) throw error;
    } catch (err) {
        console.error(err);
    }
};

window.deleteInstaComment = async function(postId, commentId) {
    const postData = cachedInstaPosts.get(postId);
    if (!postData || !Array.isArray(postData.comments)) return;

    const updatedComments = postData.comments.filter(c => c.id !== commentId);
    postData.comments = updatedComments;
    renderInstaFeedList();
    try {
        const { error } = await sb.from('insta_posts').update({ comments: updatedComments }).eq('id', postId);
        if (error) throw error;
    } catch (err) {
        console.error(err);
    }
};

window.deleteInstaPost = async function(postId) {
    if (!confirm("این پست از مینی ‌اینستاگرامموننن حذف بشههه؟")) return;
    try {
        const { error } = await sb.from('insta_posts').delete().eq('id', postId);
        if (error) throw error;
        cachedInstaPosts.delete(postId);
        renderInstaFeedList();
    } catch (err) {
        console.error(err);
        alert("خطا در حذف پست.");
    }
};

window.refreshInstaAvatars = function() {
    document.querySelectorAll('.insta-author-avatar').forEach(el => {
        const author = el.dataset.author;
        el.style.backgroundImage = (author === currentUser) ? myProfileData.pic : partnerProfileData.pic;
    });
};

function renderInstaFeedList() {
    const instaFeedListEl = document.getElementById('instaFeedList');
    const homeInstaCount = document.getElementById('homeInstaCount');
    const homeInstaSubtitle = document.getElementById('homeInstaSubtitle');
    if (instaFeedListEl) instaFeedListEl.innerHTML = '';

    const sorted = Array.from(cachedInstaPosts.values()).sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const totalPosts = sorted.length;
    if (homeInstaCount) {
        homeInstaCount.textContent = totalPosts > 0 ? `${totalPosts} پست` : 'جدید';
    }

    if (totalPosts === 0) {
        if (homeInstaSubtitle) homeInstaSubtitle.textContent = 'آلبوم و پست ‌های ما';
        if (instaFeedListEl) {
            instaFeedListEl.innerHTML = `
                <div class="sheet-empty-state">
                    <div class="sheet-empty-icon" style="color: #e11d48;"><i class="fa-solid fa-camera-retro"></i></div>
                    <p>هنوز پستی تو مینی‌ اینستاگرام نذاشتیمم قلبم</p>
                    <span>روی دکمه «+ پست جدید» توو اون بالا بزن بعد اولین عکس پست رو میشه گذاشت</span>
                </div>
            `;
        }
        return;
    }

    let latestCaption = null;
    sorted.forEach((data) => {
        const postId = data.id;
        if (!latestCaption) {
            latestCaption = data.caption ? `${data.author}: ${data.caption}` : `پست جدید از ${data.author}`;
        }

        const authorAvatarBg = (data.author === currentUser) ? myProfileData.pic : partnerProfileData.pic;
        const likesArr = Array.isArray(data.likes) ? data.likes : [];
        const isLikedByMe = likesArr.includes(currentUser);
        const commentsArr = Array.isArray(data.comments) ? data.comments : [];

        const mediaItems = (Array.isArray(data.mediaItems) && data.mediaItems.length > 0)
            ? data.mediaItems
            : [{ type: 'image', url: data.imageUrl || '' }];
        const isMultiSlide = mediaItems.length > 1;

        let timeDisplay = '';
        if (data.dateObj) {
            timeDisplay = data.dateObj.getHours().toString().padStart(2, '0') + ':' + data.dateObj.getMinutes().toString().padStart(2, '0');
        }
        const dateStr = data.dateString || '';

        const likedByHtml = likesArr.length > 0
            ? `<div class="insta-liked-by">لایک شده توسط <strong>${escapeHtml(likesArr.join(' و '))}</strong></div>`
            : '';

        const captionHtml = data.caption
            ? `<div class="insta-caption-box"><span class="insta-caption-author">${escapeHtml(data.author || '')}</span>${escapeHtml(data.caption)}</div>`
            : '';

        const commentsListHtml = commentsArr.length > 0
            ? `<div class="insta-comments-list">` + commentsArr.map(c => `
                <div class="insta-comment-item">
                    <div>
                        <span class="insta-comment-author">${escapeHtml(c.author || '')}:</span>
                        <span>${escapeHtml(c.text || '')}</span>
                    </div>
                    <button type="button" class="insta-comment-del" title="حذف کامنت" onclick="deleteInstaComment('${postId}', '${c.id}')">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `).join('') + `</div>`
            : '';

        const slidesHtml = mediaItems.map((mItem) => {
            const safeUrl = escapeHtml(mItem.url || '');
            if (mItem.type === 'video') {
                return `
                    <div class="insta-carousel-slide" data-type="video" data-url="${safeUrl}">
                        <video class="insta-post-video" src="${safeUrl}" loop muted playsinline preload="metadata"></video>
                        <button type="button" class="insta-video-mute-btn" onclick="toggleInstaVideoMute(event, this)" title="قطع/وصل صدا">
                            <i class="fa-solid fa-volume-xmark"></i>
                        </button>
                        <button type="button" class="insta-fullscreen-trigger-btn" onclick="event.stopPropagation(); openInstaFullscreen('video', '${safeUrl}')" title="بزرگنمایی تمام‌صفحه">
                            <i class="fa-solid fa-expand"></i>
                        </button>
                    </div>
                `;
            } else {
                return `
                    <div class="insta-carousel-slide" data-type="image" data-url="${safeUrl}">
                        <img class="insta-post-img" src="${safeUrl}" alt="Post Image" loading="lazy">
                        <button type="button" class="insta-fullscreen-trigger-btn" onclick="event.stopPropagation(); openInstaFullscreen('image', '${safeUrl}')" title="بزرگنمایی تمام‌صفحه">
                            <i class="fa-solid fa-expand"></i>
                        </button>
                    </div>
                `;
            }
        }).join('');

        const counterBadgeHtml = isMultiSlide
            ? `<div class="insta-slide-counter-badge" id="insta-counter-${postId}">1/${mediaItems.length}</div>`
            : '';

        const dotsHtml = isMultiSlide
            ? `<div class="insta-carousel-dots" id="insta-dots-${postId}">` +
                mediaItems.map((_, idx) => `<span class="insta-carousel-dot ${idx === 0 ? 'active' : ''}"></span>`).join('') +
              `</div>`
            : `<div></div>`;

        const postCard = document.createElement('article');
        postCard.className = 'insta-post-card';
        postCard.innerHTML = `
            <div class="insta-post-header">
                <div class="insta-author-box">
                    <div class="insta-author-avatar" data-author="${escapeHtml(data.author || '')}" style='background-image: ${authorAvatarBg};'></div>
                    <div class="insta-author-meta">
                        <span class="insta-author-name">${escapeHtml(data.author || '')}</span>
                        <span class="insta-post-date">${escapeHtml(dateStr)}${timeDisplay ? ' • ' + timeDisplay : ''}</span>
                    </div>
                </div>
                <button type="button" class="insta-delete-btn" title="حذف پست" onclick="deleteInstaPost('${postId}')">
                    <i class="fa-regular fa-trash-can"></i>
                </button>
            </div>

            <div class="insta-media-wrap" id="insta-media-${postId}">
                ${counterBadgeHtml}
                <div class="insta-carousel-track" id="insta-track-${postId}">
                    ${slidesHtml}
                </div>
            </div>

            <div class="insta-actions-bar">
                <div class="insta-actions-right">
                    <button type="button" class="insta-action-btn ${isLikedByMe ? 'liked' : ''}" onclick="toggleInstaLike('${postId}')">
                        <i class="${isLikedByMe ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                        <span class="insta-action-count">${likesArr.length > 0 ? likesArr.length : ''}</span>
                    </button>
                    <button type="button" class="insta-action-btn" onclick="document.getElementById('insta-comment-inp-${postId}')?.focus()">
                        <i class="fa-regular fa-comment"></i>
                        <span class="insta-action-count">${commentsArr.length > 0 ? commentsArr.length : ''}</span>
                    </button>
                </div>
                ${dotsHtml}
            </div>

            ${likedByHtml}
            ${captionHtml}

            <div class="insta-comments-section">
                ${commentsListHtml}
                <div class="insta-comment-form">
                    <input type="text" id="insta-comment-inp-${postId}" class="insta-comment-input" placeholder="ثبت کامنت زیر این پست..." autocomplete="off">
                    <button type="button" class="insta-comment-send" onclick="addInstaComment('${postId}')" title="ارسال کامنت">
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;

        if (instaFeedListEl) instaFeedListEl.appendChild(postCard);

        postCard.querySelectorAll('video.insta-post-video').forEach(vid => {
            if (instaVideoObserver) instaVideoObserver.observe(vid);
        });

        const trackEl = postCard.querySelector(`#insta-track-${postId}`);
        if (trackEl && isMultiSlide) {
            trackEl.addEventListener('scroll', () => {
                const slideWidth = trackEl.clientWidth || 1;
                const idx = Math.min(
                    mediaItems.length - 1,
                    Math.max(0, Math.round(Math.abs(trackEl.scrollLeft) / slideWidth))
                );
                const counterEl = postCard.querySelector(`#insta-counter-${postId}`);
                if (counterEl) counterEl.textContent = `${idx + 1}/${mediaItems.length}`;
                const dotsContainer = postCard.querySelector(`#insta-dots-${postId}`);
                if (dotsContainer) {
                    Array.from(dotsContainer.children).forEach((dot, dIdx) => {
                        dot.classList.toggle('active', dIdx === idx);
                    });
                }
            }, { passive: true });
        }

        const mediaWrap = postCard.querySelector(`#insta-media-${postId}`);
        if (mediaWrap) {
            let lastTapInsta = 0;
            let singleTapTimer = null;

            mediaWrap.addEventListener('touchend', (e) => {
                if (e.target.closest('button')) return;
                const now = Date.now();
                const slideEl = e.target.closest('.insta-carousel-slide');
                if (now - lastTapInsta < 300 && now - lastTapInsta > 0) {
                    clearTimeout(singleTapTimer);
                    e.preventDefault();
                    window.toggleInstaLike(postId, mediaWrap, true);
                } else if (slideEl && slideEl.dataset.type === 'video') {
                    singleTapTimer = setTimeout(() => {
                        window.openInstaFullscreen('video', slideEl.dataset.url);
                    }, 300);
                }
                lastTapInsta = now;
            });

            mediaWrap.addEventListener('dblclick', (e) => {
                if (e.target.closest('button')) return;
                clearTimeout(singleTapTimer);
                window.toggleInstaLike(postId, mediaWrap, true);
            });
        }

        const cmtInp = postCard.querySelector(`#insta-comment-inp-${postId}`);
        if (cmtInp) {
            cmtInp.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') window.addInstaComment(postId);
            });
        }
    });

    if (homeInstaSubtitle && latestCaption) {
        homeInstaSubtitle.textContent = latestCaption;
    }
}

// ==================== ۵. سیستم دستیار هوشمند درسی پارمیس (Study Planner & Exam Tracker) ====================
let cachedStudyTasks = new Map();
let cachedStudyExams = new Map();
let activeStudyDayFilter = 'همه';

window.openStudySheet = function() {
    document.getElementById('studySheet').classList.add('active');
    if (navigator.vibrate) navigator.vibrate(15);
};

window.closeStudySheet = function() {
    const sheet = document.getElementById('studySheet');
    if (sheet) sheet.classList.remove('active');
};

window.switchStudyTab = function(tabName) {
    document.querySelectorAll('.study-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.study-pane').forEach(p => p.classList.remove('active'));
    const btn = document.getElementById(`studyTabBtn-${tabName}`);
    const pane = document.getElementById(`studyPane-${tabName}`);
    if (btn) btn.classList.add('active');
    if (pane) pane.classList.add('active');
};

window.filterStudyDay = function(dayName) {
    activeStudyDayFilter = dayName;
    document.querySelectorAll('#studyDaysFilterBar .study-day-pill').forEach(btn => {
        btn.classList.toggle('active', btn.textContent === dayName || (dayName === 'همه' && (btn.textContent === 'همه روز ها' || btn.textContent === 'همه روزها')));
    });
    renderStudyTasksList();
};

window.addStudyTask = async function() {
    const titleInp = document.getElementById('studyTaskTitleInp');
    const daySel = document.getElementById('studyTaskDaySelect');
    const timeInp = document.getElementById('studyTaskTimeInp');

    const title = titleInp ? titleInp.value.trim() : '';
    const day = daySel ? daySel.value : 'شنبه';
    const duration = timeInp ? timeInp.value.trim() : '';

    if (!title) return;

    titleInp.value = '';
    if (timeInp) timeInp.value = '';

    const newId = generateDocId('stask');
    const newRow = {
        id: newId,
        title: title,
        day: day,
        duration: duration,
        done: false,
        added_by: currentUser,
        created_at: new Date().toISOString()
    };

    try {
        const { error } = await sb.from('study_tasks').insert(newRow);
        if (error) throw error;
        cachedStudyTasks.set(newId, mapStudyTaskRow(newRow));
        renderStudyTasksList();
    } catch (err) {
        console.error(err);
        alert("خطا در ثبت برنامه درسی.");
    }
};

window.toggleStudyTask = async function(taskId) {
    const data = cachedStudyTasks.get(taskId);
    if (!data) return;
    const nextDone = !data.done;
    data.done = nextDone;
    renderStudyTasksList();
    if (navigator.vibrate) navigator.vibrate(20);
    try {
        const { error } = await sb.from('study_tasks').update({ done: nextDone }).eq('id', taskId);
        if (error) throw error;
    } catch (err) {
        console.error(err);
    }
};

window.deleteStudyTask = async function(taskId) {
    try {
        const { error } = await sb.from('study_tasks').delete().eq('id', taskId);
        if (error) throw error;
        cachedStudyTasks.delete(taskId);
        renderStudyTasksList();
    } catch (err) {
        console.error(err);
    }
};

function renderStudyTasksList() {
    const listEl = document.getElementById('studyTasksList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const allTasks = Array.from(cachedStudyTasks.entries()).sort(([, a], [, b]) => {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    const totalCount = allTasks.length;
    const doneCount = allTasks.filter(([, t]) => t.done).length;
    const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    const percentBadge = document.getElementById('studyProgressPercent');
    const barFill = document.getElementById('studyProgressBarFill');
    const labelEl = document.getElementById('studyProgressLabel');
    const homeCount = document.getElementById('homeStudyCount');
    const homeSub = document.getElementById('homeStudySubtitle');

    if (percentBadge) percentBadge.textContent = `${percent}%`;
    if (barFill) barFill.style.width = `${percent}%`;
    if (homeCount) homeCount.textContent = `${percent}%`;

    if (labelEl) {
        if (totalCount === 0) {
            labelEl.textContent = 'هنوز درسی به برنامه اضافه نشدههه بچم';
        } else if (percent === 100) {
            labelEl.textContent = `افرینننن دورت بگردمم هر ${totalCount} مبحثوو کامل خوندیییی `;
        } else {
            labelEl.textContent = `${doneCount} از ${totalCount} خوندیییی `;
        }
    }

    if (homeSub) {
        const upcomingExamsCount = Array.from(cachedStudyExams.values()).filter(e => !e.done).length;
        if (upcomingExamsCount > 0) {
            homeSub.textContent = `${upcomingExamsCount} امتحان پیش رو • ${percent}% خوندن`;
        } else if (totalCount > 0) {
            homeSub.textContent = `${doneCount} از ${totalCount} درس خوندهه شده`;
        } else {
            homeSub.textContent = 'امتحانات و برنامه ‌ریزی';
        }
    }

    const filtered = activeStudyDayFilter === 'همه'
        ? allTasks
        : allTasks.filter(([, t]) => t.day === activeStudyDayFilter);

    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="sheet-empty-state" style="padding: 24px 14px;">
                <div class="sheet-empty-icon"><i class="fa-solid fa-book-bookmark"></i></div>
                <p>موردی برای نمایش تو «${escapeHtml(activeStudyDayFilter)}» وجود نداره</p>
                <span>از فرم بالا مبحث درسی و روز مطالعه روو اضافه کن زندگیم</span>
            </div>
        `;
        return;
    }

    filtered.forEach(([taskId, data]) => {
        const card = document.createElement('div');
        card.className = `study-task-card ${data.done ? 'done' : ''}`;
        card.onclick = () => window.toggleStudyTask(taskId);

        const timeTag = data.duration
            ? `<span class="study-time-badge"><i class="fa-regular fa-clock"></i> ${escapeHtml(data.duration)}</span>`
            : '';

        card.innerHTML = `
            <button type="button" class="todo-checkbox ${data.done ? 'checked' : ''}">
                <i class="fa-solid fa-check"></i>
            </button>
            <div class="study-task-info">
                <span class="study-task-title">${escapeHtml(data.title || '')}</span>
                <div class="study-task-tags">
                    <span class="study-day-badge">${escapeHtml(data.day || 'شنبه')}</span>
                    ${timeTag}
                </div>
            </div>
            <button type="button" class="todo-item-del" title="حذف" onclick="event.stopPropagation(); deleteStudyTask('${taskId}')">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        listEl.appendChild(card);
    });
}

window.addExamItem = async function() {
    const titleInp = document.getElementById('examTitleInp');
    const dateInp = document.getElementById('examDateInp');
    const topicInp = document.getElementById('examTopicInp');

    const title = titleInp ? titleInp.value.trim() : '';
    const examDate = dateInp ? dateInp.value.trim() : '';
    const topic = topicInp ? topicInp.value.trim() : '';

    if (!title) return;

    titleInp.value = '';
    if (dateInp) dateInp.value = '';
    if (topicInp) topicInp.value = '';

    const newId = generateDocId('exam');
    const newRow = {
        id: newId,
        title: title,
        exam_date: examDate || 'به ‌زودییی',
        topic: topic,
        done: false,
        added_by: currentUser,
        created_at: new Date().toISOString()
    };

    try {
        const { error } = await sb.from('study_exams').insert(newRow);
        if (error) throw error;
        cachedStudyExams.set(newId, mapStudyExamRow(newRow));
        renderStudyExamsList();
    } catch (err) {
        console.error(err);
        alert("خطا در ثبت امتحان.");
    }
};

window.toggleExamDone = async function(examId) {
    const data = cachedStudyExams.get(examId);
    if (!data) return;
    const nextDone = !data.done;
    data.done = nextDone;
    renderStudyExamsList();
    if (navigator.vibrate) navigator.vibrate(20);
    try {
        const { error } = await sb.from('study_exams').update({ done: nextDone }).eq('id', examId);
        if (error) throw error;
    } catch (err) {
        console.error(err);
    }
};

window.deleteExamItem = async function(examId) {
    try {
        const { error } = await sb.from('study_exams').delete().eq('id', examId);
        if (error) throw error;
        cachedStudyExams.delete(examId);
        renderStudyExamsList();
    } catch (err) {
        console.error(err);
    }
};

function renderStudyExamsList() {
    const studyExamsListEl = document.getElementById('studyExamsList');
    if (studyExamsListEl) studyExamsListEl.innerHTML = '';

    const sorted = Array.from(cachedStudyExams.values()).sort((a, b) => {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    if (sorted.length === 0) {
        if (studyExamsListEl) {
            studyExamsListEl.innerHTML = `
                <div class="sheet-empty-state" style="padding: 24px 14px;">
                    <div class="sheet-empty-icon" style="color: #e11d48;"><i class="fa-regular fa-bell"></i></div>
                    <p>هنوز امتحانی تو لیست ثبت نکردی دور سرت بگردم</p>
                    <span>امتحانات پیش‌ روت تو طول هفته روو با تاریخ و مبحث تو  بالا ثبت کن زندگیم</span>
                </div>
            `;
        }
        renderStudyTasksList();
        return;
    }

    sorted.forEach((data) => {
        const examId = data.id;
        const card = document.createElement('div');
        card.className = `study-exam-card ${data.done ? 'done' : ''}`;
        card.innerHTML = `
            <div class="study-exam-right" onclick="toggleExamDone('${examId}')" style="cursor: pointer;">
                <div class="study-exam-icon">
                    <i class="fa-solid ${data.done ? 'fa-check' : 'fa-graduation-cap'}"></i>
                </div>
                <div class="study-exam-details">
                    <h4 class="study-exam-title" style="${data.done ? 'text-decoration: line-through; opacity: 0.7;' : ''}">${escapeHtml(data.title || '')}</h4>
                    ${data.topic ? `<span class="study-exam-topic">${escapeHtml(data.topic)}</span>` : ''}
                    <span class="study-exam-date"><i class="fa-regular fa-calendar-days"></i> ${escapeHtml(data.examDate || '')}</span>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
                <button type="button" class="todo-checkbox ${data.done ? 'checked' : ''}" onclick="toggleExamDone('${examId}')" title="برگزار شد">
                    <i class="fa-solid fa-check"></i>
                </button>
                <button type="button" class="todo-item-del" onclick="deleteExamItem('${examId}')" title="حذف امتحان">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        `;
        if (studyExamsListEl) studyExamsListEl.appendChild(card);
    });

    renderStudyTasksList();
}

// ==================== رندر پروفایل کاربران و پیام‌های چت ====================
function applyPartnerProfileUI(pData) {
    if (!pData) return;
    const statusEl = document.getElementById('userStatusText');
    const dotEl = document.getElementById('statusDot');
    const homeDotEl = document.getElementById('homeCardStatusDot');
    const headerAvatar = document.getElementById('headerPartnerAvatar');
    const homeCardAvatar = document.getElementById('homeCardPartnerAvatar');
    const partnerModalStatus = document.getElementById('partnerModalStatus');
    const homeChatSubtitle = document.getElementById('homeChatCardSubtitle');

    if (pData.sounds !== undefined) {
        partnerProfileData.sounds = extractUserSounds(pData);
    }

    if (pData.isTyping) {
        statusEl.innerHTML = `<span class="typing-label">دارمم مینیویسم</span><span class="typing-dots"><span></span><span></span><span></span></span>`;
        statusEl.className = "user-status typing";
        dotEl.className = "online-dot online";
        homeDotEl.className = "card-online-dot online";
        homeChatSubtitle.textContent = "دارمم مینیویسم...";
        homeChatSubtitle.style.color = "#4f46e5";
    } else if (pData.isOnline) {
        statusEl.textContent = "انلاینمم";
        statusEl.className = "user-status online";
        dotEl.className = "online-dot online";
        homeDotEl.className = "card-online-dot online";
        if (partnerModalStatus) partnerModalStatus.textContent = "انلاینمم";
        if (homeChatSubtitle.textContent === "..." || homeChatSubtitle.textContent === "دارمم مینیویسم...") {
            homeChatSubtitle.textContent = homeChatSubtitle.dataset.lastMsg || "گفتگوی خصوصی شما";
            homeChatSubtitle.style.color = "";
        }
    } else {
        let timeStr = "اخیرااا";
        if (pData.lastSeen) {
            const date = pData.lastSeen;
            timeStr = date.getHours().toString().padStart(2, '0') + ":" + date.getMinutes().toString().padStart(2, '0');
        }
        statusEl.textContent = "اخرین بازدیدم " + timeStr;
        statusEl.className = "user-status";
        dotEl.className = "online-dot";
        homeDotEl.className = "card-online-dot";
        if (partnerModalStatus) partnerModalStatus.textContent = "اخرین بازدیدم  " + timeStr;
        if (homeChatSubtitle.textContent === "دارمم مینیویسم...") {
            homeChatSubtitle.textContent = homeChatSubtitle.dataset.lastMsg || "گفتگوی خصوصی شما";
            homeChatSubtitle.style.color = "";
        }
    }

    if (pData.profilePic) {
        partnerProfileData.pic = `url(${pData.profilePic})`;
    } else {
        partnerProfileData.pic = `url("${defaultAvatarSVG}")`;
    }
    if (pData.bio !== undefined) partnerProfileData.bio = pData.bio;
    headerAvatar.style.backgroundImage = partnerProfileData.pic;
    homeCardAvatar.style.backgroundImage = partnerProfileData.pic;
    if (window.refreshInstaAvatars) window.refreshInstaAvatars();

    document.getElementById('partnerProfileBio').textContent = partnerProfileData.bio || "چیزیی بیو نذاشتمم";
    document.getElementById('partnerProfilePic').style.backgroundImage = partnerProfileData.pic;
}

function applyMyProfileUI(myData) {
    if (!myData) return;
    if (myData.sounds !== undefined) {
        myProfileData.sounds = extractUserSounds(myData);
    }
    if (myData.profilePic) {
        myProfileData.pic = `url(${myData.profilePic})`;
        myProfileData.hasCustomPic = true;
    } else {
        myProfileData.pic = `url("${defaultAvatarSVG}")`;
        myProfileData.hasCustomPic = false;
    }
    if (myData.bio !== undefined) myProfileData.bio = myData.bio;
    document.getElementById('settingsProfilePic').style.backgroundImage = myProfileData.pic;
    document.getElementById('homeMyAvatar').style.backgroundImage = myProfileData.pic;
    if (window.refreshInstaAvatars) window.refreshInstaAvatars();
    const removeBtn = document.getElementById('removeProfilePicBtn');
    if (removeBtn) removeBtn.style.display = myProfileData.hasCustomPic ? 'inline-flex' : 'none';
}

function renderChatMessages(newlyAddedId = null) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const wasAtBottom = isInitialMessagesLoad || (chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 150);

    const sorted = Array.from(cachedMessages.values()).sort((a, b) => {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    chatMessages.innerHTML = '';
    unreadDocsIds = [];
    const seenNowIds = [];
    let lastMsgText = "هنوز پیامی نفرستادیمم";
    let lastRenderedDateKey = null;

    if (sorted.length === 0) {
        chatMessages.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fa-regular fa-comments"></i></div>
                <p>هنوز پیامی ارسال نشده است</p>
                <span>پیاممم بفرستتتت هیهیهیهی</span>
            </div>
        `;
        updateUnreadBadge(0);
        const subEl = document.getElementById('homeChatCardSubtitle');
        subEl.dataset.lastMsg = lastMsgText;
        subEl.textContent = lastMsgText;
        return;
    }

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    sorted.forEach((data) => {
        const isMe = data.sender === currentUser;
        const docId = data.id;

        lastMsgText = (isMe ? "شما: " : "") + data.text;

        if (!isMe && !data.seen) {
            if (activeScreen === 'chat') {
                data.seen = true;
                seenNowIds.push(docId);
            } else {
                unreadDocsIds.push(docId);
            }
        }

        const msgDateObj = data.dateObj || new Date();
        const timeString = msgDateObj.getHours().toString().padStart(2, '0') + ":" + msgDateObj.getMinutes().toString().padStart(2, '0');

        const currentDateKey = getDateKey(msgDateObj);
        if (currentDateKey !== lastRenderedDateKey) {
            lastRenderedDateKey = currentDateKey;
            const sepDiv = document.createElement('div');
            sepDiv.className = 'date-separator';
            sepDiv.innerHTML = `<span>${formatDateSeparatorLabel(msgDateObj)}</span>`;
            chatMessages.appendChild(sepDiv);
        }

        const msgWrapper = document.createElement('div');
        msgWrapper.className = `message-wrapper ${isMe ? 'sent-wrapper' : 'received-wrapper'} ${selectedMsgIds.has(docId) ? 'selected' : ''}`;
        msgWrapper.dataset.id = docId;

        if (newlyAddedId && docId === newlyAddedId) {
            msgWrapper.style.animation = "msgAppear 0.28s cubic-bezier(0.16, 1, 0.3, 1) both";
        }

        let replyBlock = '';
        if (data.replyTo) {
            replyBlock = `
                <div class="replied-msg">
                    <div class="replied-sender">${escapeHtml(data.replyTo.sender)}</div>
                    <div class="replied-text">${escapeHtml(data.replyTo.text)}</div>
                </div>
            `;
        }

        let checkIcon = '';
        if (isMe) {
            if (data.seen) checkIcon = `<i class="fa-solid fa-check-double tick-icon seen"></i>`;
            else checkIcon = `<i class="fa-solid fa-check tick-icon"></i>`;
        }

        let editedTag = '';
        if (data.edited) {
            editedTag = `<span class="edited-label">ویرایش شده</span>`;
        }

        const isMagicMsg = detectMagicKey(data.text) !== null;
        let voiceReplayBtn = '';
        if (isMagicMsg) {
            voiceReplayBtn = `<button class="voice-magic-btn" type="button" title="پخش صدای کلمه جادویی"><i class="fa-solid fa-volume-high"></i></button>`;
        }

        let likeBadge = '';
        if (data.liked) {
            likeBadge = `<div class="reaction-pill"><i class="fa-solid fa-heart"></i></div>`;
        }

        let swipeIconHtml = `<div class="swipe-reply-icon"><i class="fa-solid fa-reply"></i></div>`;
        let selectCheckHtml = `<div class="select-checkbox"><i class="fa-solid fa-check"></i></div>`;

        msgWrapper.innerHTML = `
            ${selectCheckHtml}
            <div class="message ${isMe ? 'sent' : 'received'} ${data.liked ? 'has-reaction' : ''} ${isMagicMsg ? 'magic-message' : ''}" id="msg-${docId}">
                ${swipeIconHtml}
                ${replyBlock}
                <div class="message-text">${escapeHtml(data.text)}</div>
                <div class="message-meta">
                    ${voiceReplayBtn}
                    ${editedTag}
                    <span class="message-time">${timeString}</span>
                    ${checkIcon}
                </div>
                ${likeBadge}
            </div>
        `;
        chatMessages.appendChild(msgWrapper);

        const msgDiv = msgWrapper.querySelector('.message');
        const swipeIcon = msgWrapper.querySelector('.swipe-reply-icon');
        const magicBtn = msgWrapper.querySelector('.voice-magic-btn');
        if (magicBtn) {
            magicBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isSelectionMode) {
                    toggleMessageSelection(docId);
                    return;
                }
                window.playMessageVoiceEffect(data.sender, data.text, false);
            });
        }

        msgWrapper.addEventListener('click', (e) => {
            if (isSelectionMode) {
                e.stopPropagation();
                toggleMessageSelection(docId);
            }
        });

        let lastTap = 0;
        let startX = 0;
        let startY = 0;
        let currentPullX = 0;
        let isSwiping = false;
        let longPressTimer = null;
        let touchedInsideBubble = false;

        msgWrapper.addEventListener('touchstart', (e) => {
            if (isSelectionMode) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            currentPullX = 0;
            isSwiping = true;
            touchedInsideBubble = !!e.target.closest('.message');
            msgDiv.style.transition = 'none';

            if (touchedInsideBubble) {
                longPressTimer = setTimeout(() => {
                    isSwiping = false;
                    if (navigator.vibrate) navigator.vibrate(40);
                    showActions(docId, isMe, data.sender, data.text, data.liked);
                }, 600);
            }
        }, { passive: true });

        msgWrapper.addEventListener('touchmove', (e) => {
            if (isSelectionMode) return;
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                clearTimeout(longPressTimer);
            }
            if (!isSwiping) return;

            if (Math.abs(dy) > Math.abs(dx) && Math.abs(currentPullX) < 10) {
                isSwiping = false;
                msgDiv.style.transform = 'translateX(0)';
                swipeIcon.style.opacity = '0';
                return;
            }

            let diffX = dx;
            if (diffX > 0) diffX = 0;
            if (diffX < -64) diffX = -64;
            currentPullX = diffX;

            if (diffX < -6) {
                msgDiv.style.transform = `translateX(${diffX}px)`;
                const ratio = Math.min(1, Math.abs(diffX) / 46);
                swipeIcon.style.opacity = ratio;
                swipeIcon.style.transform = `translateY(-50%) scale(${0.6 + ratio * 0.4})`;
            }
        }, { passive: true });

        msgWrapper.addEventListener('touchend', (e) => {
            clearTimeout(longPressTimer);
            if (isSelectionMode) return;

            if (touchedInsideBubble) {
                const currentTime = new Date().getTime();
                const tapLength = currentTime - lastTap;
                if (tapLength < 320 && tapLength > 0 && Math.abs(currentPullX) < 10) {
                    toggleLike(docId, !!data.liked, msgDiv);
                    e.preventDefault();
                }
                lastTap = currentTime;
            }

            if (!isSwiping) return;
            isSwiping = false;

            msgDiv.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
            msgDiv.style.transform = 'translateX(0)';
            swipeIcon.style.opacity = '0';

            if (currentPullX <= -44) {
                triggerReply(docId, data.sender, data.text);
            }
            currentPullX = 0;
        });

        if (!isMobile) {
            msgDiv.addEventListener('dblclick', () => {
                if (!isSelectionMode) toggleLike(docId, !!data.liked, msgDiv);
            });
            msgDiv.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (!isSelectionMode) showActions(docId, isMe, data.sender, data.text, data.liked);
            });
        }
    });

    if (seenNowIds.length > 0) {
        sb.from('messages').update({ seen: true }).in('id', seenNowIds).then(() => {}).catch(() => {});
    }

    updateUnreadBadge(unreadDocsIds.length);
    const subEl = document.getElementById('homeChatCardSubtitle');
    subEl.dataset.lastMsg = lastMsgText;
    if (subEl.textContent !== "دارمم مینیویسم...") {
        subEl.textContent = lastMsgText;
    }

    if (isSearchOpen) {
        performChatSearch();
    } else if (activeScreen === 'chat' && wasAtBottom) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// ==================== بارگذاری سریع و مرحله‌ای (اولویت‌بندی‌شده) و همگام‌سازی زنده ====================
const LIGHT_USER_COLUMNS = 'username, is_online, is_typing, in_draw_game, last_seen, profile_pic, bio, mood';
const INITIAL_RECENT_MESSAGES_LIMIT = 60;

async function loadUserSoundsInBackground(partnerName) {
    if (soundsLoaded) return;
    try {
        await getDb();
        const { data, error } = await sb
            .from('users')
            .select('username, sounds')
            .in('username', [currentUser, partnerName]);
        if (error || !data) return;
        data.forEach(uRow => {
            const extracted = extractUserSounds({ sounds: uRow.sounds });
            if (uRow.username === partnerName) partnerProfileData.sounds = extracted;
            if (uRow.username === currentUser) myProfileData.sounds = extracted;
        });
        soundsLoaded = true;
    } catch (err) {
        console.warn("Lazy sounds load skipped:", err);
    }
}

async function loadFullMessagesArchiveInBackground() {
    if (fullMessagesArchiveLoaded) return;
    try {
        const allRows = await fetchAllRows('messages', 'created_at', true);
        let addedOlderCount = 0;
        allRows.forEach(r => {
            notifiedMessageIds.add(r.id);
            if (!cachedMessages.has(r.id)) {
                cachedMessages.set(r.id, mapMessageRow(r));
                addedOlderCount++;
            }
        });
        fullMessagesArchiveLoaded = true;
        if (addedOlderCount > 0) {
            const chatMessages = document.getElementById('chatMessages');
            const prevScrollHeight = chatMessages ? chatMessages.scrollHeight : 0;
            const prevScrollTop = chatMessages ? chatMessages.scrollTop : 0;
            const wasNearBottom = chatMessages
                ? (chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 150)
                : true;
            renderChatMessages();
            if (chatMessages && activeScreen === 'chat' && !wasNearBottom) {
                chatMessages.scrollTop = prevScrollTop + (chatMessages.scrollHeight - prevScrollHeight);
            }
        }
    } catch (err) {
        console.warn("Archive messages background load error:", err);
    }
}

async function refreshPriorityChatAndUsers() {
    await getDb();
    const partnerName = (currentUser === "مهدی") ? "پارمیس" : "مهدی";
    const [usersRes, recentMsgsRes] = await Promise.all([
        sb.from('users').select(LIGHT_USER_COLUMNS).in('username', [currentUser, partnerName]),
        sb.from('messages').select('*').order('created_at', { ascending: false }).limit(INITIAL_RECENT_MESSAGES_LIMIT)
    ]);

    if (usersRes.data) {
        usersRes.data.forEach(uRow => {
            const mapped = mapUserRow(uRow);
            if (uRow.username === partnerName) applyPartnerProfileUI(mapped);
            if (uRow.username === currentUser) applyMyProfileUI(mapped);
        });
    }

    const recentRows = Array.isArray(recentMsgsRes.data) ? [...recentMsgsRes.data].reverse() : [];
    const recentIds = new Set(recentRows.map(r => r.id));

    let newestExternalMsg = null;
    if (!fullMessagesArchiveLoaded && cachedMessages.size === 0) {
        recentRows.forEach(r => {
            const m = mapMessageRow(r);
            cachedMessages.set(m.id, m);
            notifiedMessageIds.add(m.id);
        });
    } else {
        // همگام‌سازی پنجره آخرین پیام‌ها بدون پاک کردن آرشیو پیام‌های قدیمی‌تر
        if (recentRows.length > 0) {
            const oldestRecentTime = new Date(recentRows[0].created_at).getTime();
            for (const [id, msg] of cachedMessages.entries()) {
                const msgTime = new Date(msg.createdAt).getTime();
                if (msgTime >= oldestRecentTime && !recentIds.has(id)) {
                    cachedMessages.delete(id);
                }
            }
        }
        recentRows.forEach(r => {
            const m = mapMessageRow(r);
            cachedMessages.set(m.id, m);
            if (isInitialMessagesLoad) {
                notifiedMessageIds.add(m.id);
            } else if (!notifiedMessageIds.has(m.id)) {
                notifiedMessageIds.add(m.id);
                newestExternalMsg = m;
            }
        });
    }

    if (newestExternalMsg) {
        if (detectMagicKey(newestExternalMsg.text)) {
            triggerMagicVisualParticles();
        }
        if (newestExternalMsg.sender !== currentUser) {
            window.playMessageVoiceEffect(newestExternalMsg.sender, newestExternalMsg.text, true);
            dispatchLocalSystemNotification(
                `پیام جدید از ${newestExternalMsg.sender} 💙`,
                newestExternalMsg.text || 'یک پیام جدید ارسال شد',
                'chat-msg-' + newestExternalMsg.id,
                'chat'
            );
        }
    }

    renderChatMessages(newestExternalMsg ? newestExternalMsg.id : null);
    isInitialMessagesLoad = false;
}

async function refreshAllDataSilently() {
    try {
        const partnerName = (currentUser === "مهدی") ? "پارمیس" : "مهدی";

        // مرحله ۱ (فوری): اطلاعات سبک پروفایل (بدون ویس‌های سنگین) + ۶۰ پیام آخر
        await refreshPriorityChatAndUsers();

        // مرحله ۲ (پس‌زمینه): سایر بخش‌ها + آرشیو پیام‌های قدیمی‌تر + فایل‌های صوتی بدون قفل کردن رابط کاربری
        const [memRows, todoRows, instaRows] = await Promise.all([
            fetchAllRows('memories', 'created_at', false),
            fetchAllRows('todo_categories', 'created_at', true),
            fetchAllRows('insta_posts', 'created_at', false)
        ]);

        cachedMemories.clear();
        memRows.forEach(r => cachedMemories.set(r.id, mapMemoryRow(r)));
        renderMemoriesList();

        cachedTodoCategories.clear();
        todoRows.forEach(r => cachedTodoCategories.set(r.id, mapTodoRow(r)));
        renderTodoCategoriesList();

        cachedInstaPosts.clear();
        instaRows.forEach(r => {
            const p = mapInstaRow(r);
            cachedInstaPosts.set(p.id, p);
            if (isInitialInstaLoad) notifiedInstaIds.add(p.id);
        });
        renderInstaFeedList();
        isInitialInstaLoad = false;

        const [taskRows, examRows] = await Promise.all([
            fetchAllRows('study_tasks', 'created_at', true),
            fetchAllRows('study_exams', 'created_at', true)
        ]);

        cachedStudyTasks.clear();
        taskRows.forEach(r => cachedStudyTasks.set(r.id, mapStudyTaskRow(r)));

        cachedStudyExams.clear();
        examRows.forEach(r => cachedStudyExams.set(r.id, mapStudyExamRow(r)));
        renderStudyExamsList();

        // بارگذاری تنبل آرشیو پیام‌های قدیمی‌تر و ویس‌های جادویی در پس‌زمینه
        loadFullMessagesArchiveInBackground();
        loadUserSoundsInBackground(partnerName);
    } catch (err) {
        console.error("Supabase data refresh error:", err);
    }
}

function startFallbackSyncIfNeeded() {
    if (fallbackSyncTimer) return;
    fallbackSyncTimer = setInterval(() => {
        if (isRealtimeConnected || document.visibilityState !== 'visible' || !sb) return;
        refreshPriorityChatAndUsers().catch(() => {});
    }, 5000);
}

function setupSupabaseRealtime(partnerName) {
    if (appRealtimeChannel) {
        sb.removeChannel(appRealtimeChannel);
        appRealtimeChannel = null;
    }

    appRealtimeChannel = sb.channel('parmisapp-realtime-hub')
        // ۱. تغییرات وضعیت و پروفایل کاربران
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
            const row = payload.new;
            if (!row) return;
            const mapped = mapUserRow(row);
            if (row.username === partnerName) applyPartnerProfileUI(mapped);
            if (row.username === currentUser) applyMyProfileUI(mapped);
        })
        // ۲. پیام‌های چت زنده
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
            if (payload.eventType === 'INSERT' && payload.new) {
                const newMsg = mapMessageRow(payload.new);
                cachedMessages.set(newMsg.id, newMsg);

                if (!isInitialMessagesLoad && !notifiedMessageIds.has(newMsg.id)) {
                    notifiedMessageIds.add(newMsg.id);
                    const isFromPartner = newMsg.sender !== currentUser;
                    if (detectMagicKey(newMsg.text)) {
                        triggerMagicVisualParticles();
                    }
                    if (isFromPartner) {
                        window.playMessageVoiceEffect(newMsg.sender, newMsg.text, true);
                        dispatchLocalSystemNotification(
                            `پیام جدید از ${newMsg.sender} 💙`,
                            newMsg.text || 'یک پیام جدید ارسال شد',
                            'chat-msg-' + newMsg.id,
                            'chat'
                        );
                    }
                }
                renderChatMessages(newMsg.id);
            } else if (payload.eventType === 'UPDATE' && payload.new) {
                const updated = mapMessageRow(payload.new);
                cachedMessages.set(updated.id, updated);
                renderChatMessages();
            } else if (payload.eventType === 'DELETE' && payload.old) {
                cachedMessages.delete(payload.old.id);
                renderChatMessages();
            }
        })
        // ۳. دفترچه خاطرات زنده
        .on('postgres_changes', { event: '*', schema: 'public', table: 'memories' }, (payload) => {
            if (payload.eventType === 'DELETE' && payload.old) {
                cachedMemories.delete(payload.old.id);
            } else if (payload.new) {
                const m = mapMemoryRow(payload.new);
                cachedMemories.set(m.id, m);
            }
            renderMemoriesList();
        })
        // ۴. کارهایی که باید انجام بدیم زنده
        .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_categories' }, (payload) => {
            if (payload.eventType === 'DELETE' && payload.old) {
                cachedTodoCategories.delete(payload.old.id);
            } else if (payload.new) {
                const c = mapTodoRow(payload.new);
                cachedTodoCategories.set(c.id, c);
            }
            renderTodoCategoriesList();
        })
        // ۵. پست‌های مینی‌اینستاگرام زنده
        .on('postgres_changes', { event: '*', schema: 'public', table: 'insta_posts' }, (payload) => {
            if (payload.eventType === 'DELETE' && payload.old) {
                cachedInstaPosts.delete(payload.old.id);
            } else if (payload.new) {
                const p = mapInstaRow(payload.new);
                cachedInstaPosts.set(p.id, p);
                if (payload.eventType === 'INSERT' && !isInitialInstaLoad && !notifiedInstaIds.has(p.id)) {
                    notifiedInstaIds.add(p.id);
                    if (p.author && p.author !== currentUser) {
                        dispatchLocalSystemNotification(
                            `پست جدید در مینی‌اینستاگرام 📸`,
                            `${p.author} یک پست جدید منتشر کرد: ${p.caption || ''}`,
                            'insta-post-' + p.id,
                            'insta'
                        );
                    }
                }
            }
            renderInstaFeedList();
        })
        // ۶. برنامه مطالعه هفتگی زنده
        .on('postgres_changes', { event: '*', schema: 'public', table: 'study_tasks' }, (payload) => {
            if (payload.eventType === 'DELETE' && payload.old) {
                cachedStudyTasks.delete(payload.old.id);
            } else if (payload.new) {
                const t = mapStudyTaskRow(payload.new);
                cachedStudyTasks.set(t.id, t);
            }
            renderStudyTasksList();
        })
        // ۷. لیست امتحانات زنده
        .on('postgres_changes', { event: '*', schema: 'public', table: 'study_exams' }, (payload) => {
            if (payload.eventType === 'DELETE' && payload.old) {
                cachedStudyExams.delete(payload.old.id);
            } else if (payload.new) {
                const e = mapStudyExamRow(payload.new);
                cachedStudyExams.set(e.id, e);
            }
            renderStudyExamsList();
        })
        .subscribe((status) => {
            isRealtimeConnected = (status === 'SUBSCRIBED');
            if (isRealtimeConnected) {
                console.log('✅ Supabase Realtime connected');
            }
        });
}

function initApp() {
    if (appInitialized) return;
    appInitialized = true;
    updateSoundIcon();
    updateNotificationStatusUI();
    syncViewport();

    if ('Notification' in window && Notification.permission === 'granted') {
        window.enablePushNotifications(true);
    }

    const partnerName = (currentUser === "مهدی") ? "پارمیس" : "مهدی";

    document.getElementById('homeGreetingName').textContent = `سلام، ${currentUser}`;
    document.getElementById('homeChatCardTitle').textContent = `چت با ${partnerName}`;
    document.getElementById('userNameDisplay').textContent = partnerName;

    document.getElementById('headerPartnerAvatar').style.backgroundImage = partnerProfileData.pic;
    document.getElementById('homeCardPartnerAvatar').style.backgroundImage = partnerProfileData.pic;
    document.getElementById('homeMyAvatar').style.backgroundImage = myProfileData.pic;

    const chatMessages = document.getElementById('chatMessages');
    const scrollBottomBtn = document.getElementById('scrollBottomBtn');

    chatMessages.addEventListener('scroll', () => {
        const distFromBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
        if (distFromBottom > 180) {
            scrollBottomBtn.classList.add('visible');
        } else {
            scrollBottomBtn.classList.remove('visible');
        }
    }, { passive: true });

    const sendBtn = document.getElementById('sendBtn');
    const input = document.getElementById('messageInput');

    input.addEventListener('focus', () => {
        syncViewport();
        setTimeout(syncViewport, 60);
        setTimeout(syncViewport, 180);
        setTimeout(syncViewport, 350);
    });
    input.addEventListener('blur', () => {
        setTimeout(syncViewport, 60);
        setTimeout(syncViewport, 200);
    });

    let typingTimer;
    input.addEventListener('input', () => {
        setTypingStatus(true);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => setTypingStatus(false), 1500);
    });

    async function sendMessage() {
        const text = input.value.trim();
        if (text === "") return;

        input.value = '';
        setTypingStatus(false);
        document.getElementById('emojiPanel').classList.remove('active');

        // اگر در حالت ویرایش پیام هستیم
        if (editingMessage) {
            const targetId = editingMessage.id;
            const oldText = editingMessage.text;
            cancelReplyOrEdit();
            if (text !== oldText) {
                const existing = cachedMessages.get(targetId);
                if (existing) {
                    existing.text = text;
                    existing.edited = true;
                    renderChatMessages();
                }
                try {
                    const { error } = await sb
                        .from('messages')
                        .update({ text: text, edited: true })
                        .eq('id', targetId);
                    if (error) throw error;
                } catch (err) {
                    console.error(err);
                }
            }
            return;
        }

        const newId = generateDocId('msg');
        const replyPayload = replyingTo ? { ...replyingTo } : null;
        if (replyingTo) {
            cancelReplyOrEdit();
        }

        const newRow = {
            id: newId,
            text: text,
            sender: currentUser,
            seen: false,
            liked: false,
            edited: false,
            reply_to: replyPayload,
            msg_type: 'text',
            media_url: null,
            created_at: new Date().toISOString()
        };

        // نمایش آنی روی صفحه خودِ فرستنده
        const mappedMsg = mapMessageRow(newRow);
        cachedMessages.set(newId, mappedMsg);
        notifiedMessageIds.add(newId);
        if (detectMagicKey(text)) {
            triggerMagicVisualParticles();
        }
        renderChatMessages(newId);
        scrollToBottom(true);

        try {
            const { error } = await sb.from('messages').insert(newRow);
            if (error) throw error;
        } catch (error) {
            console.error(error);
        }
    }

    sendBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        sendMessage();
    }, { passive: false });
    sendBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
    });
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

    const searchInput = document.getElementById('chatSearchInput');
    searchInput.addEventListener('input', () => window.performChatSearch());
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            navigateSearch(-1);
        } else if (e.key === 'Escape') {
            closeSearchBar();
        }
    });

    const newCatInp = document.getElementById('newCategoryTitleInp');
    if (newCatInp) {
        newCatInp.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') window.addTodoCategory();
        });
    }

    const studyTaskTitleInp = document.getElementById('studyTaskTitleInp');
    const studyTaskTimeInp = document.getElementById('studyTaskTimeInp');
    if (studyTaskTitleInp) {
        studyTaskTitleInp.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') window.addStudyTask();
        });
    }
    if (studyTaskTimeInp) {
        studyTaskTimeInp.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') window.addStudyTask();
        });
    }
    const examTopicInp = document.getElementById('examTopicInp');
    if (examTopicInp) {
        examTopicInp.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') window.addExamItem();
        });
    }

    // بارگذاری اولیه تمام جداول + اتصال زنده Realtime از طریق ماژول مستقل db.js
    ensureSupabaseReady().then((client) => {
        sb = client;
        setOnlineStatus(true);
        refreshAllDataSilently();
        setupSupabaseRealtime(partnerName);
        startFallbackSyncIfNeeded();
    }).catch((err) => {
        console.error('Failed to boot Supabase in app.js:', err);
    });

    // باز کردن بخش هدف در صورت ورود از طریق نوتیفیکیشن
    const urlParams = new URLSearchParams(window.location.search);
    const targetViewParam = urlParams.get('view');
    if (targetViewParam === 'chat') window.openChatView();
    else if (targetViewParam === 'insta') window.openInstaSheet();
}

// ==================== راه‌اندازی اولیه برنامه پس از بارگذاری کامل تمام توابع ====================
if (!currentUser) {
    loginScreen.style.display = 'flex';
    appContainer.style.display = 'none';
} else {
    loginScreen.style.display = 'none';
    appContainer.style.display = 'flex';
    initApp();
}

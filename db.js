// ==================== ماژول مستقل اتصال به Supabase — ParmisApp (نسخه ۲۰) ====================
// تمام تنظیمات و منطق اتصال دیتابیس در این فایل متمرکز شده است.
// برای تغییر پروژه یا سرور دیتابیس، فقط کافی است مقادیر زیر را ویرایش کنید.

export const SUPABASE_URL = "https://cknciitavsagmhfnaiig.supabase.co";
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrbmNpaXRhdnNhZ21oZm5haWlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyODc2NTgsImV4cCI6MjExMDg2MzY1OH0.vphPsknLyjg5cwVveUVxl9Aku2BscGsVMdADebAaU3E";

const FALLBACK_SDK_URLS = [
    "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js",
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"
];

let sbClient = null;
let sbReadyPromise = null;

function createClientInstance(createClientFn) {
    return createClientFn(SUPABASE_URL, SUPABASE_KEY, {
        realtime: {
            params: {
                eventsPerSecond: 30
            }
        }
    });
}

function loadScriptSequential(urls) {
    return new Promise((resolve, reject) => {
        if (window.supabase && typeof window.supabase.createClient === "function") {
            resolve(window.supabase.createClient);
            return;
        }
        let idx = 0;
        function tryNext() {
            if (idx >= urls.length) {
                reject(new Error("بارگذاری کتابخانه Supabase ناموفق بود."));
                return;
            }
            const src = urls[idx++];
            const s = document.createElement("script");
            s.src = src;
            s.async = true;
            s.onload = () => {
                if (window.supabase && typeof window.supabase.createClient === "function") {
                    resolve(window.supabase.createClient);
                } else {
                    tryNext();
                }
            };
            s.onerror = () => tryNext();
            document.head.appendChild(s);
        }
        tryNext();
    });
}

// اگر تگ <script> کتابخانه Supabase در HTML لود شده باشد، کلاینت بلافاصله و بدون تاخیر ساخته می‌شود
export function getSupabaseSync() {
    if (sbClient) return sbClient;
    if (window.supabase && typeof window.supabase.createClient === "function") {
        sbClient = createClientInstance(window.supabase.createClient);
        return sbClient;
    }
    return null;
}

export async function ensureSupabaseReady() {
    if (sbClient) return sbClient;
    const syncClient = getSupabaseSync();
    if (syncClient) return syncClient;

    if (!sbReadyPromise) {
        sbReadyPromise = loadScriptSequential(FALLBACK_SDK_URLS)
            .then((createClientFn) => {
                sbClient = createClientInstance(createClientFn);
                return sbClient;
            })
            .catch((err) => {
                sbReadyPromise = null;
                console.error("Supabase SDK load error:", err);
                throw err;
            });
    }
    return sbReadyPromise;
}

// ارسال ایمن وضعیت آفلاین هنگام بستن تب یا خروج از برنامه (keepalive)
export function patchUserKeepalive(username, payload) {
    if (!username) return;
    try {
        fetch(`${SUPABASE_URL}/rest/v1/users?username=eq.${encodeURIComponent(username)}`, {
            method: "PATCH",
            keepalive: true,
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            },
            body: JSON.stringify(payload)
        }).catch(() => {});
    } catch (e) {}
}

// بروزرسانی فیلدهای کاربر در جدول users
export async function upsertUserFields(username, fields) {
    if (!username) return;
    const client = await ensureSupabaseReady();
    const { error } = await client
        .from("users")
        .upsert({ username, ...fields }, { onConflict: "username" });
    if (error) throw error;
}

// دریافت کامل ردیف‌های یک جدول با صفحه‌بندی خودکار
export async function fetchAllRows(tableName, orderCol = "created_at", ascending = true) {
    const client = await ensureSupabaseReady();
    const allRows = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
        let q = client.from(tableName).select("*");
        if (orderCol) {
            q = q.order(orderCol, { ascending });
        }
        const { data, error } = await q.range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }
    return allRows;
}

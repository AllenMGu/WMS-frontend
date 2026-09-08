// 登录页逻辑（自 index.html 内联脚本外链，以支持 CSP 移除 script-src 'unsafe-inline'）
const API_BASE_URL = (window.WMS_CONFIG?.apiBaseUrl || '/api').replace(/\/+$/, '');
const loginForm = document.getElementById('loginForm');
const passwordInput = document.getElementById('password');
const togglePassword = document.getElementById('togglePassword');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const loginBtn = document.getElementById('loginBtn');

togglePassword.addEventListener('click', function () {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    this.querySelector('i').classList.toggle('fa-eye');
    this.querySelector('i').classList.toggle('fa-eye-slash');
});

function extractDetail(detail) {
    if (!detail) return '用户名或密码错误';
    if (typeof detail === 'string') return detail;
    if (detail.message) return detail.message;
    if (Array.isArray(detail)) return detail.map(d => d.msg).join('；');
    return JSON.stringify(detail);
}

loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = passwordInput.value;
    const remember = document.getElementById('remember').checked;
    errorMessage.classList.add('hidden');
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>登录中...';
    try {
        const response = await fetch(API_BASE_URL + '/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ username, password })
        });
        let data = null;
        try { data = await response.json(); } catch (e) { /* ignore */ }
        if (!response.ok) throw new Error(extractDetail(data));
        const storage = remember ? localStorage : sessionStorage;
        storage.removeItem('access_token'); storage.removeItem('user'); storage.removeItem('token_expiry');
        storage.setItem('access_token', data.access_token);
        storage.setItem('user', JSON.stringify(data.user));
        // 会话时效以服务端 expiry(JWT exp) 为准，不伪造更长有效期(P1-2 缓解)
        if (data.expiry) storage.setItem('token_expiry', data.expiry);
        window.location.href = 'app.html';
    } catch (error) {
        errorText.textContent = error.message;
        errorMessage.classList.remove('hidden');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>登录</span><i class="fa fa-sign-in ml-2"></i>';
    }
});

// 已登录则直接进入
(function () {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (token) {
        const expiry = localStorage.getItem('token_expiry') || sessionStorage.getItem('token_expiry');
        if (!expiry || new Date() < new Date(expiry)) window.location.href = 'app.html';
    }
})();

/* 森光學習站：Google Sheets API 前端。預設為 API 模式，不含靜態真實資料。 */
(() => {
  'use strict';
  const CONFIG = Object.freeze(Object.assign({
    API_URL: '', API_TIMEOUT_MS: 12000, IDLE_MS: 10 * 60 * 1000, REMINDER_MS: 8 * 60 * 1000
  }, window.APP_CONFIG || {}));
  const $ = selector => document.querySelector(selector);
  const studentSelect = $('#studentSelect'), examSelect = $('#examSelect'), passwordInput = $('#passwordInput');
  let currentRecord = null, idleTimer = null, reminderTimer = null, activityHandlers = [];

  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
  function unique(values) { return [...new Set(values)]; }
  function toHalfWidth(value) { return String(value ?? '').replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)); }
  function isApiMode() { return typeof CONFIG.API_URL === 'string' && CONFIG.API_URL.trim().length > 0; }
  function setLoginEnabled(enabled) { [studentSelect, examSelect, passwordInput, $('#loginSubmit')].forEach(el => { el.disabled = !enabled; }); }
  function showConfigPrompt() { $('#configAlert').classList.remove('hidden'); $('#optionsStatus').textContent = '尚未設定 API_URL：請先建立 config.js，網站目前不會送出任何查詢。'; $('#syncStatus').textContent = 'API_URL 未設定'; $('#syncStatus').classList.remove('api'); setLoginEnabled(false); }
  function clearError() { $('#loginError').textContent = ''; }
  function showGenericError() { $('#loginError').textContent = '查詢資料不正確，請重新確認後再試。'; }
  function errorMessage(error) { if (error && error.code === 'TIMEOUT') return '連線逾時，請稍後再試。'; if (error && error.code === 'NETWORK') return '目前無法連線到查詢服務，請確認網路或 API 部署設定。'; if (error && error.code === 'NON_JSON') return '查詢服務回應格式不正確，請檢查 Web App 部署與 API URL。'; return '查詢服務暫時無法使用，請稍後再試。'; }

  /* 空白、缺漏或無法解析的組距人數維持 null／待補，絕不視為 0。 */
  function normalizeCount(value) {
    if (value === null || value === undefined || String(value).trim() === '') return { valid: false, value: null, display: '待補', reason: '空白' };
    const normalized = toHalfWidth(value).trim().replace(/,/g, '').replace(/\s+/g, '');
    if (/缺漏|無資料|待補|N\/A/i.test(normalized)) return { valid: false, value: null, display: '待補', reason: '缺漏文字' };
    const match = normalized.match(/[-+]?\d+(?:\.\d+)?/);
    if (!match) return { valid: false, value: null, display: '待補', reason: '無法解析' };
    const number = Number(match[0]);
    if (Number.isFinite(number) && number >= 0 && Number.isInteger(number)) return { valid: true, value: number, display: String(number) };
    return { valid: false, value: null, display: '待補', reason: '非有效整數' };
  }

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);
    try {
      let response;
      try { response = await fetch(url, Object.assign({}, options, { signal: controller.signal, cache: 'no-store' })); }
      catch (error) { if (error.name === 'AbortError') { const timeoutError = new Error('timeout'); timeoutError.code = 'TIMEOUT'; throw timeoutError; } const networkError = new Error('network'); networkError.code = 'NETWORK'; throw networkError; }
      const text = await response.text();
      let payload;
      try { payload = JSON.parse(text); } catch (error) { const nonJson = new Error('non-json'); nonJson.code = 'NON_JSON'; throw nonJson; }
      if (!response.ok || !payload || payload.ok !== true) { const apiError = new Error('api-error'); apiError.code = payload?.errorCode || 'API_ERROR'; throw apiError; }
      return payload;
    } finally { clearTimeout(timeout); }
  }
  function apiUrl(action) { return `${CONFIG.API_URL.trim()}${CONFIG.API_URL.includes('?') ? '&' : '?'}action=${encodeURIComponent(action)}&t=${Date.now()}`; }
  async function fetchOptions() { return fetchJson(apiUrl('options'), { method: 'GET', headers: { Accept: 'application/json' } }); }
  async function fetchLogin(payload) { return fetchJson(CONFIG.API_URL.trim(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8', Accept: 'application/json' }, body: JSON.stringify(Object.assign({ action: 'login' }, payload)) }); }
  async function fetchLogout(payload) { return fetchJson(CONFIG.API_URL.trim(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8', Accept: 'application/json' }, body: JSON.stringify(Object.assign({ action: 'logout' }, payload)) }); }

  function populateSelectors(options) {
    const students = Array.isArray(options?.students) ? options.students : [], exams = Array.isArray(options?.exams) ? options.exams : [];
    studentSelect.innerHTML = '<option value="">請選擇學生</option>' + students.map(student => `<option value="${escapeHtml(student.studentId)}">${escapeHtml(student.studentName || student.studentId)}</option>`).join('');
    examSelect.innerHTML = '<option value="">請選擇考試</option>' + exams.map(exam => `<option value="${escapeHtml(exam.examKey)}">${escapeHtml(exam.examLabel || exam.examKey)}</option>`).join('');
    setLoginEnabled(students.length > 0 && exams.length > 0);
  }
  async function loadOptions() {
    if (!isApiMode()) return showConfigPrompt();
    $('#syncStatus').textContent = 'API 連線中…'; $('#syncStatus').classList.add('api'); $('#optionsStatus').textContent = '正在從 Google Sheets API 取得最新選單…';
    try {
      const result = await fetchOptions(); populateSelectors(result.data); $('#optionsStatus').textContent = `選單已更新${result.updatedAt ? `｜資料時間：${result.updatedAt}` : ''}`; $('#syncStatus').textContent = 'API 同步模式';
      if (!result.data.students?.length || !result.data.exams?.length) $('#optionsStatus').textContent += '；請檢查後端工作表名稱與欄位設定。';
    } catch (error) { setLoginEnabled(false); $('#optionsStatus').textContent = errorMessage(error); $('#syncStatus').textContent = 'API 連線失敗'; }
  }
  function selectedInputs() { return { studentId: studentSelect.value, examKey: examSelect.value, password: passwordInput.value }; }
  function validateInputs(values) { if (!values.studentId || !values.examKey || !values.password) { const error = new Error('invalid-input'); error.code = 'INPUT'; throw error; } }
  async function authenticate() { const values = selectedInputs(); validateInputs(values); return fetchLogin(values); }
  function logout(localOnly = false) {
    const payload = { studentId: currentRecord?.studentId || '', examKey: currentRecord?.examKey || '' };
    currentRecord = null; $('#dashboardView').classList.add('hidden'); $('#loginView').classList.remove('hidden'); $('#logoutBtn').classList.add('hidden'); $('#idleModal').classList.add('hidden'); passwordInput.value = ''; clearError(); stopIdleTimers(); $('#loginView').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!localOnly && isApiMode() && payload.studentId) fetchLogout(payload).catch(() => {});
  }
  function startIdleTimers() { stopIdleTimers(); const reset = () => { clearTimeout(idleTimer); clearTimeout(reminderTimer); reminderTimer = setTimeout(() => $('#idleModal').classList.remove('hidden'), CONFIG.REMINDER_MS); idleTimer = setTimeout(() => logout(), CONFIG.IDLE_MS); }; activityHandlers = ['click', 'keydown', 'touchstart', 'scroll'].map(event => { const handler = reset; document.addEventListener(event, handler, { passive: true }); return [event, handler]; }); reset(); }
  function stopIdleTimers() { clearTimeout(idleTimer); clearTimeout(reminderTimer); activityHandlers.forEach(([event, handler]) => document.removeEventListener(event, handler)); activityHandlers = []; }
  function renderSummary(record, result) { const items = [['學生', record.studentName], ['年級 / 班級', `${record.grade || '未提供'} / ${record.className || '未提供'}`], ['考試', record.examLabel || record.examKey], ['資料備註', record.remarks || '—']]; $('#studentSummary').innerHTML = items.map(([label, value]) => `<dl class="summary-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></dl>`).join(''); $('#resultContext').textContent = `${record.grade || '—'}年級・${record.examLabel || record.examKey}・資料由受控 API 回傳`; $('#lastUpdated').textContent = `資料最後更新：${escapeHtml(result.updatedAt || record.updatedAt || '後端未提供')}`; $('#noticeTitle').textContent = '已由後端驗證，僅顯示本次授權資料'; $('#noticeText').textContent = (record.warnings?.length ? `部分欄位待補：${record.warnings.length} 項。` : '前端未保存密碼；資料由受控 API 從 Google Sheets 讀取。'); }
  function renderScoreCards(record) { const average = Number.isFinite(Number(record.average)) ? record.average : '—', cards = [['總分', record.totalScore, '分', '#cfeee0'], ['平均', average, '分', '#ffd9c8'], ['班級名次', record.rank, ` / ${record.classSize || '—'} 名`, '#ded8f6']]; $('#scoreCards').innerHTML = cards.map(([label, value, suffix, tone]) => `<div class="score-card" style="--tone:${tone}"><span class="label">${escapeHtml(label ?? '—')}</span><strong>${escapeHtml(value ?? '—')}<small>${escapeHtml(suffix)}</small></strong></div>`).join(''); }
  function validSubjects(record) { return (record.subjects || []).filter(subject => Number.isFinite(Number(subject.rawScore))); }
  function renderTable(record) { $('#subjectTable').innerHTML = (record.subjects || []).map(subject => { const extra = Object.entries(subject.rawFields || {}).filter(([key]) => !['科目', 'subject', '原始分數', 'rawScore', '加權分數', 'weightedScore', '補考分數', 'makeupScore', '備註', 'remark'].includes(key)).slice(0, 5).map(([key, value]) => `${escapeHtml(key)}：${escapeHtml(value)}`).join('　'); return `<tr><td><strong>${escapeHtml(subject.name || '未命名科目')}</strong>${extra ? `<small class="subject-extra">${extra}</small>` : ''}</td><td class="score">${subject.rawScore == null ? '待補' : `${escapeHtml(subject.rawScore)} 分`}</td><td>${subject.weightedScore == null || subject.weightedScore === '' ? '—' : `${escapeHtml(subject.weightedScore)} 分`} ${subject.makeupScore ? `<br><small>補考：${escapeHtml(subject.makeupScore)}</small>` : ''}</td><td>${escapeHtml(subject.remark || '—')}</td></tr>`; }).join(''); }
  function renderBarChart(record) { const subjects = validSubjects(record); if (!subjects.length) { $('#barChart').innerHTML = '<div class="empty-data">沒有足夠的有效科目分數。</div>'; return; } const width = 520, height = 270, left = 42, bottom = 40, top = 12, chartH = height - bottom - top, chartW = width - left - 15, slot = chartW / subjects.length, barW = Math.min(48, slot * .62); const lines = [0, 25, 50, 75, 100].map(v => { const y = top + chartH - v / 100 * chartH; return `<line x1="${left}" x2="${width - 15}" y1="${y}" y2="${y}" class="grid-line"/><text x="${left - 9}" y="${y + 4}" text-anchor="end" class="axis-label">${v}</text>`; }).join(''); const bars = subjects.map((subject, index) => { const score = Number(subject.rawScore), x = left + slot * index + (slot - barW) / 2, h = Math.max(0, Math.min(100, score)) / 100 * chartH, y = top + chartH - h; return `<rect class="bar-rect" x="${x}" y="${y}" width="${barW}" height="${h}" rx="7"/><text class="bar-value" x="${x + barW / 2}" y="${y - 7}" text-anchor="middle">${score}</text><text class="axis-label" x="${x + barW / 2}" y="${height - 13}" text-anchor="middle">${escapeHtml(subject.name)}</text>`; }).join(''); $('#barChart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="科目分數長條圖">${lines}<line x1="${left}" x2="${width - 15}" y1="${top + chartH}" y2="${top + chartH}" stroke="#bbc8c0"/>${bars}</svg>`; }
  function renderRadar(record) { const subjects = validSubjects(record).slice(0, 8); if (!subjects.length) { $('#radarChart').innerHTML = '<div class="empty-data">沒有足夠的有效科目分數。</div>'; return; } const cx = 180, cy = 142, radius = 100, levels = [.25, .5, .75, 1], point = (ratio, index, r = radius) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / subjects.length; return [cx + Math.cos(angle) * r * ratio, cy + Math.sin(angle) * r * ratio]; }; const rings = levels.map(level => `<polygon class="radar-axis" fill="none" points="${subjects.map((_, index) => point(1, index, radius * level).join(',')).join(' ')}"/>`).join(''), axes = subjects.map((_, index) => { const [x, y] = point(1, index); return `<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`; }).join(''), labels = subjects.map((subject, index) => { const [x, y] = point(1, index, radius + 19); return `<text class="axis-label" x="${x}" y="${y + 3}" text-anchor="middle">${escapeHtml(subject.name)}</text>`; }).join(''), polygon = subjects.map((subject, index) => point(Math.max(0, Math.min(100, Number(subject.rawScore))) / 100, index).join(',')).join(''), dots = subjects.map((subject, index) => { const [x, y] = point(Number(subject.rawScore) / 100, index); return `<circle class="radar-dot" cx="${x}" cy="${y}" r="3.5"/>`; }).join(''); $('#radarChart').innerHTML = `<svg viewBox="0 0 360 285" role="img" aria-label="科目分數雷達圖">${rings}${axes}<polygon class="radar-fill" points="${polygon}"/>${dots}${labels}</svg>`; }
  function renderDistribution(record) { const normalized = (record.scoreDistribution || []).map(item => ({ ...item, normalized: normalizeCount(item.count) })), valid = normalized.filter(item => item.normalized.valid), total = valid.reduce((sum, item) => sum + item.normalized.value, 0), average = Number(record.average); const rows = normalized.map(item => { const info = item.normalized, width = total ? info.value / total * 100 : 0, bounds = String(item.range || '').split(/[–-]/).map(Number), current = info.valid && Number.isFinite(average) && bounds.length === 2 && average >= bounds[0] && average <= bounds[1]; return `<div class="distribution-row"><div class="distribution-meta"><span>${escapeHtml(item.range || '未命名組距')} 分</span><span class="${info.valid ? '' : 'invalid-count'}">${info.valid ? `${info.display} 人` : info.display}</span></div><div class="distribution-track"><div class="distribution-fill" style="width:${width}%"></div>${current ? '<i class="distribution-marker" title="學生平均所在組距"></i>' : ''}</div></div>`; }).join(''); $('#distributionChart').innerHTML = `<div class="distribution-legend">有效組距筆數：<strong>${valid.length} / ${normalized.length}</strong>${valid.length < normalized.length ? '　缺漏資料不計入圖表，請逐欄核對原始試算表。' : ''}</div>${rows || '<div class="empty-data">尚無組距資料。</div>'}`; }
  function renderInsights(record) { const sorted = validSubjects(record).sort((a, b) => Number(b.rawScore) - Number(a.rawScore)), best = sorted[0], weak = sorted[sorted.length - 1]; $('#strengthTitle').textContent = best ? `${best.name} ${best.rawScore} 分` : '資料不足'; $('#strengthText').textContent = best ? (best.remark || '這是目前分數最高的科目，可以把方法分享給其他科目。') : '資料不足，無法判斷。'; $('#focusTitle').textContent = weak ? `${weak.name} ${weak.rawScore} 分` : '資料不足'; $('#focusText').textContent = weak ? (weak.remark || '建議拆成小單元，從錯題與基礎觀念開始。') : '資料不足，無法判斷。'; $('#adviceText').textContent = best && weak ? `維持${best.name}的解題節奏，接著為${weak.name}安排每週兩次、每次 20 分鐘的錯題整理。` : '需先補齊有效分數，才能提供個人化建議。'; }
  function renderDashboard(record, result) { renderSummary(record, result); renderScoreCards(record); renderTable(record); renderBarChart(record); renderRadar(record); renderDistribution(record); renderInsights(record); }

  $('#loginForm').addEventListener('submit', async event => { event.preventDefault(); clearError(); const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true; event.currentTarget.setAttribute('aria-busy', 'true'); try { const result = await authenticate(); currentRecord = result.data; renderDashboard(currentRecord, result); $('#loginView').classList.add('hidden'); $('#dashboardView').classList.remove('hidden'); $('#logoutBtn').classList.remove('hidden'); $('#dashboardView').scrollIntoView({ behavior: 'smooth', block: 'start' }); startIdleTimers(); } catch (error) { if (error.code === 'INPUT') $('#loginError').textContent = '請選擇學生、考試並輸入密碼。'; else if (['TIMEOUT', 'NETWORK', 'NON_JSON'].includes(error.code)) $('#loginError').textContent = errorMessage(error); else showGenericError(); } finally { button.disabled = false; event.currentTarget.removeAttribute('aria-busy'); passwordInput.value = ''; } });
  $('#logoutBtn').addEventListener('click', () => logout()); $('#idleLogoutBtn').addEventListener('click', () => logout()); $('#stayBtn').addEventListener('click', () => { $('#idleModal').classList.add('hidden'); startIdleTimers(); });
  loadOptions(); window.normalizeCount = normalizeCount;
})();

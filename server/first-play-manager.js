const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || ''
const notice = document.querySelector('#notice')
const entryForm = document.querySelector('#entry-form')
const entryList = document.querySelector('#entry-list')
const candidateList = document.querySelector('#candidate-list')
const importPreview = document.querySelector('#import-preview')
const importSummary = document.querySelector('#import-summary')
const confirmImportButton = document.querySelector('#confirm-import')

let currentEntries = []
let currentCandidates = []
let currentImport = null
let editingId = null
let candidateTimer = 0
let entryTimer = 0

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function showNotice(message, kind = 'success') {
  notice.textContent = message
  notice.dataset.kind = kind
  notice.hidden = false
  window.clearTimeout(showNotice.timer)
  showNotice.timer = window.setTimeout(() => { notice.hidden = true }, 6500)
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (options.method && options.method !== 'GET') headers.set('X-CSRF-Token', csrfToken)
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, headers })
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json') ? await response.json() : null
  if (!response.ok) throw new Error(body?.error || `本地请求失败（HTTP ${response.status}）。`)
  return body
}

function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function precisionLabel(precision) {
  return ({ day: '精确到日', month: '精确到月', year: '精确到年', unknown: '待确认' })[precision] || '待确认'
}

function sourceLabel(source) {
  return ({
    'heybox-import': '小黑盒导入',
    'manual': '手动记录',
    'steam-client-get-last-played-times': 'Steam 客户端首玩记录',
  })[source] || String(source || '未知来源')
}

function entryDate(entry) {
  return entry.firstPlayedOn ? `${entry.firstPlayedOn} · ${precisionLabel(entry.datePrecision)}` : '日期待确认'
}

function coverMarkup(url, name) {
  if (!url) return '<span class="cover-placeholder" aria-hidden="true">B.</span>'
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)} 游戏封面" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'cover-placeholder',textContent:'B.'}))">`
}

async function loadEntries() {
  const query = document.querySelector('#entry-search').value.trim()
  entryList.innerHTML = '<div class="empty-message">正在读取时间轴…</div>'
  try {
    const result = await api(`/api/timeline/entries?q=${encodeURIComponent(query)}`)
    currentEntries = result.entries
    document.querySelector('#entries-count').textContent = `${currentEntries.length} 条记录`
    renderEntries()
  } catch (error) {
    entryList.innerHTML = '<div class="empty-message">暂时无法读取时间轴。</div>'
    showNotice(error.message, 'error')
  }
}

function renderEntries() {
  if (!currentEntries.length) {
    entryList.innerHTML = '<div class="empty-message">还没有符合条件的记录。可以在上方手动添加，或导入 CSV / JSON 历史数据。</div>'
    return
  }
  entryList.innerHTML = currentEntries.map(entry => {
    const cover = coverMarkup(entry.headerImage, entry.gameName)
    if (editingId === entry.id) {
      return `<article class="entry-card" data-entry-id="${escapeHtml(entry.id)}">
        ${cover}
        <div class="entry-copy"><b>${escapeHtml(entry.gameName)}</b><small>${escapeHtml(entryDate(entry))} · ${escapeHtml(sourceLabel(entry.source))}</small></div>
        <div class="entry-card__actions"><button class="button button-quiet" data-action="save-edit" data-id="${escapeHtml(entry.id)}">保存</button><button class="button button-quiet" data-action="cancel-edit">取消</button></div>
        <form class="entry-editor" data-editor="${escapeHtml(entry.id)}">
          <input class="editor-field wide" data-field="gameName" maxlength="200" value="${escapeHtml(entry.gameName)}" aria-label="游戏名称" required />
          <input class="editor-field" data-field="firstPlayedOn" value="${escapeHtml(entry.firstPlayedOn || '')}" placeholder="YYYY-MM-DD / YYYY-MM / YYYY" aria-label="首次游玩日期" />
          <select class="editor-field" data-field="datePrecision" aria-label="日期精度">
            ${[['day','精确到日'],['month','精确到月'],['year','精确到年'],['unknown','待确认']].map(([value,label]) => `<option value="${value}" ${entry.datePrecision === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
          <textarea class="editor-field wide" data-field="personalNote" rows="3" maxlength="4000" aria-label="个人评语">${escapeHtml(entry.personalNote || '')}</textarea>
        </form>
      </article>`
    }
    return `<article class="entry-card" data-entry-id="${escapeHtml(entry.id)}">
      ${cover}
      <div class="entry-copy"><b>${escapeHtml(entry.gameName)}</b><small>${escapeHtml(entryDate(entry))} · ${escapeHtml(sourceLabel(entry.source))} · ${entry.steamAppId ? `AppID ${entry.steamAppId}` : '自定义游戏'}</small>${entry.originalFirstPlaytime ? `<small class="entry-raw-time">原始时间戳 ${entry.originalFirstPlaytime}（Unix 秒）</small>` : ''}${entry.personalNote ? `<p>${escapeHtml(entry.personalNote)}</p>` : ''}</div>
      <div class="entry-card__actions"><button class="button button-quiet" data-action="edit" data-id="${escapeHtml(entry.id)}">编辑</button><button class="button danger" data-action="delete" data-id="${escapeHtml(entry.id)}">删除</button></div>
    </article>`
  }).join('')
}

async function loadCandidates() {
  const query = document.querySelector('#candidate-search').value.trim()
  candidateList.innerHTML = '<div class="empty-message">正在读取 Steam 游戏候选…</div>'
  try {
    const result = await api(`/api/timeline/candidates?q=${encodeURIComponent(query)}`)
    currentCandidates = result.candidates
    document.querySelector('#candidate-count').textContent = `${currentCandidates.length} 个候选`
    renderCandidates()
  } catch (error) {
    candidateList.innerHTML = '<div class="empty-message">暂时无法读取 Steam 游戏候选。</div>'
    showNotice(error.message, 'error')
  }
}

function renderCandidates() {
  if (!currentCandidates.length) {
    candidateList.innerHTML = '<div class="empty-message">没有找到尚未加入时间轴的游戏。</div>'
    return
  }
  candidateList.innerHTML = currentCandidates.map(candidate => `<article class="candidate-card">
    ${coverMarkup(candidate.headerImage, candidate.gameName)}
    <div class="candidate-copy"><b>${escapeHtml(candidate.gameName)}</b><small>Steam AppID ${candidate.steamAppId}${candidate.playtimeMinutes !== null ? ` · 累计 ${Math.floor(candidate.playtimeMinutes / 60)} 小时` : ''}</small></div>
    <button class="button button-quiet" type="button" data-action="choose-candidate" data-id="${candidate.steamAppId}">选这款</button>
  </article>`).join('')
}

function precisionForDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'day'
  if (/^\d{4}-\d{2}$/.test(value)) return 'month'
  if (/^\d{4}$/.test(value)) return 'year'
  return 'unknown'
}

entryForm.addEventListener('submit', async event => {
  event.preventDefault()
  const gameName = document.querySelector('#game-name').value.trim()
  const appIdText = document.querySelector('#app-id').value.trim()
  const firstPlayedOn = document.querySelector('#first-played-on').value.trim()
  const datePrecision = document.querySelector('#date-precision').value
  try {
    const result = await api('/api/timeline/entries', {
      method: 'POST',
      body: JSON.stringify({
        gameName,
        steamAppId: appIdText ? Number(appIdText) : null,
        firstPlayedOn: datePrecision === 'unknown' ? null : firstPlayedOn,
        datePrecision: datePrecision || precisionForDate(firstPlayedOn),
        personalNote: document.querySelector('#personal-note').value,
      }),
    })
    entryForm.reset()
    document.querySelector('#first-played-on').value = localToday()
    document.querySelector('#date-precision').value = 'day'
    showNotice(result.exportError || '已加入时间轴，并更新了本地静态 JSON。', result.exportError ? 'error' : 'success')
    await Promise.all([loadEntries(), loadCandidates()])
  } catch (error) { showNotice(error.message, 'error') }
})

document.querySelector('#date-precision').addEventListener('change', event => {
  if (event.target.value === 'unknown') document.querySelector('#first-played-on').value = ''
})

candidateList.addEventListener('click', event => {
  const button = event.target.closest('[data-action="choose-candidate"]')
  if (!button) return
  const candidate = currentCandidates.find(item => item.steamAppId === Number(button.dataset.id))
  if (!candidate) return
  document.querySelector('#game-name').value = candidate.gameName
  document.querySelector('#app-id').value = candidate.steamAppId
  document.querySelector('#game-name').focus()
  showNotice(`已选择 ${candidate.gameName}。确认首次游玩日期后加入时间轴。`)
  window.scrollTo({ top: 0, behavior: 'smooth' })
})

entryList.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]')
  if (!button) return
  const { action, id } = button.dataset
  if (action === 'edit') { editingId = id; renderEntries(); return }
  if (action === 'cancel-edit') { editingId = null; renderEntries(); return }
  if (action === 'save-edit') {
    const form = entryList.querySelector(`[data-editor="${CSS.escape(id)}"]`)
    if (!form) return
    const get = name => form.querySelector(`[data-field="${name}"]`).value
    const precision = get('datePrecision')
    try {
      const result = await api(`/api/timeline/entries/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ gameName: get('gameName'), firstPlayedOn: precision === 'unknown' ? null : get('firstPlayedOn'), datePrecision: precision, personalNote: get('personalNote') }),
      })
      editingId = null
      showNotice(result.exportError || '时间轴记录已更新。', result.exportError ? 'error' : 'success')
      await Promise.all([loadEntries(), loadCandidates()])
    } catch (error) { showNotice(error.message, 'error') }
  }
  if (action === 'delete') {
    const entry = currentEntries.find(item => item.id === id)
    if (!entry || !window.confirm(`确定从首次游玩时间轴中删除“${entry.gameName}”吗？Steam 游戏档案不会被删除。`)) return
    try {
      const result = await api(`/api/timeline/entries/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ confirm: true }) })
      showNotice(result.exportError || '时间轴记录已删除。', result.exportError ? 'error' : 'success')
      await Promise.all([loadEntries(), loadCandidates()])
    } catch (error) { showNotice(error.message, 'error') }
  }
})

document.querySelector('#candidate-search').addEventListener('input', () => {
  window.clearTimeout(candidateTimer)
  candidateTimer = window.setTimeout(() => { void loadCandidates() }, 220)
})
document.querySelector('#entry-search').addEventListener('input', () => {
  window.clearTimeout(entryTimer)
  entryTimer = window.setTimeout(() => { void loadEntries() }, 220)
})

document.querySelector('#export-button').addEventListener('click', async event => {
  event.currentTarget.disabled = true
  try {
    const result = await api('/api/timeline/export', { method: 'POST', body: '{}' })
    showNotice(`已重新生成时间轴 JSON，共 ${result.entryCount} 条记录。`)
  } catch (error) { showNotice(error.message, 'error') }
  finally { event.currentTarget.disabled = false }
})

function renderImportPreview(data) {
  currentImport = data
  importSummary.hidden = false
  const summaryLabels = {
    originalRecordCount: '原始记录', recognizedCount: '识别成功', appIdMatchCount: 'AppID 匹配',
    nameMatchCandidateCount: '名称候选', missingDateCount: '缺少日期', duplicateCount: '重复记录',
    dateConflictCount: '日期冲突', unrecognizedCount: '待处理',
  }
  importSummary.innerHTML = Object.entries(summaryLabels).map(([key, label]) => `<div class="summary-item"><b>${Number(data.summary[key] || 0)}</b><span>${label}</span></div>`).join('')
  importPreview.innerHTML = data.rows.map(row => {
    const defaultAction = ['duplicate', 'conflict', 'invalid', 'name-candidate'].includes(row.status) ? 'skip' : 'insert'
    const isExistingConflict = row.status === 'conflict' && row.message.includes('时间轴中已有')
    const appId = row.appId ?? row.candidateAppId
    return `<article class="preview-row" data-row="${row.rowNumber}" data-source="${escapeHtml(row.source)}">
      <div class="preview-row__top"><span>第 ${row.rowNumber} 条 · ${escapeHtml(row.status)}</span><b>${escapeHtml(row.message)}</b></div>
      <div class="preview-row__top"><span>来源 ${escapeHtml(sourceLabel(row.source))}</span><b>${row.originalFirstPlaytime ? `原始时间戳 ${row.originalFirstPlaytime}（Unix 秒）` : '没有原始时间戳'}</b></div>
      <div class="preview-edit-grid">
        <label class="wide">游戏名称<input data-field="gameName" value="${escapeHtml(row.gameName)}" maxlength="200" /></label>
        <label>AppID<input data-field="steamAppId" inputmode="numeric" value="${escapeHtml(appId ?? '')}" placeholder="留空为自定义游戏" /></label>
        <label>导入日期<input data-field="firstPlayedOn" value="${escapeHtml(row.firstPlayedOn || '')}" placeholder="YYYY-MM-DD / YYYY-MM / YYYY" /></label>
        <label>日期精度<select data-field="datePrecision">${[['day','精确到日'],['month','精确到月'],['year','精确到年'],['unknown','待确认']].map(([value,label]) => `<option value="${value}" ${row.datePrecision === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>处理方式<select data-field="action">
          <option value="skip" ${defaultAction === 'skip' ? 'selected' : ''}>跳过</option>
          <option value="insert" ${defaultAction === 'insert' ? 'selected' : ''}>加入时间轴</option>
          ${isExistingConflict ? '<option value="update">明确更新已有日期</option>' : ''}
        </select></label>
      </div>
    </article>`
  }).join('')
  confirmImportButton.hidden = data.rows.length === 0
}

document.querySelector('#import-file').addEventListener('change', async event => {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const content = await file.text()
    const data = await api('/api/timeline/import/preview', { method: 'POST', body: JSON.stringify({ fileName: file.name, content }) })
    renderImportPreview(data)
    showNotice(`已生成 ${data.summary.originalRecordCount} 条记录的导入预览。源文件已保存在本机私有目录。`)
  } catch (error) { showNotice(error.message, 'error') }
})

confirmImportButton.addEventListener('click', async () => {
  if (!currentImport) return
  const decisions = [...importPreview.querySelectorAll('.preview-row')].map(card => {
    const get = name => card.querySelector(`[data-field="${name}"]`).value
    const appIdText = get('steamAppId').trim()
    return {
      rowNumber: Number(card.dataset.row), action: get('action'), steamAppId: appIdText ? Number(appIdText) : null,
      gameName: get('gameName').trim(), firstPlayedOn: get('datePrecision') === 'unknown' ? null : get('firstPlayedOn').trim(),
      datePrecision: get('datePrecision'), source: card.dataset.source,
    }
  })
  confirmImportButton.disabled = true
  try {
    const result = await api('/api/timeline/import/confirm', { method: 'POST', body: JSON.stringify({ previewId: currentImport.previewId, decisions }) })
    currentImport = null
    importPreview.replaceChildren()
    importSummary.hidden = true
    confirmImportButton.hidden = true
    document.querySelector('#import-file').value = ''
    showNotice(result.exportError || `导入完成：新增 ${result.inserted} 条，更新 ${result.updated} 条，跳过 ${result.skipped} 条。`, result.exportError ? 'error' : 'success')
    await Promise.all([loadEntries(), loadCandidates()])
  } catch (error) { showNotice(error.message, 'error') }
  finally { confirmImportButton.disabled = false }
})

document.querySelector('#date-precision').value = 'day'
document.querySelector('#first-played-on').value = localToday()
void Promise.all([loadEntries(), loadCandidates()])

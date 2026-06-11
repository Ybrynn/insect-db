let allInsects = [];
let editingId = null;
let currentSearchImage = null;
let currentFilter = { order: '', family: '', genus: '', host_plant: '', damage_type: '', category: '' };
let lastQueryHash = '';
let lastSearchResultIds = new Set();
let currentUser = null;

function togglePwd(btn) {
  const input = btn.parentElement.querySelector('input');
  const isPwd = input.type === 'password';
  input.type = isPwd ? 'text' : 'password';
  btn.innerHTML = isPwd
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  btn.setAttribute('aria-label', isPwd ? '隐藏密码' : '显示密码');
}

function authHeaders() {
  const t = localStorage.getItem('auth_token');
  return t ? { 'x-auth-token': t } : {};
}

function handleUnauth() {
  localStorage.removeItem('auth_token');
  currentUser = null;
  showAuth();
  throw new Error('登录已过期');
}

const api = {
  async list(q, order, family, genus, host_plant, damage_type, category) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (order) params.set('order', order);
    if (family) params.set('family', family);
    if (genus) params.set('genus', genus);
    if (host_plant) params.set('host_plant', host_plant);
    if (damage_type) params.set('damage_type', damage_type);
    if (category) params.set('category', category);
    const url = params.toString() ? `/api/insects?${params}` : '/api/insects';
    const r = await fetch(url, { headers: authHeaders() });
    if (r.status === 401) handleUnauth();
    return r.json();
  },
  async get(id) {
    const r = await fetch(`/api/insects/${id}`, { headers: authHeaders() });
    if (r.status === 401) handleUnauth();
    return r.json();
  },
  async save(data) {
    const r = await fetch('/api/insects', { method: 'POST', headers: { ...authHeaders() }, body: data });
    return r.json();
  },
  async update(id, data) {
    const r = await fetch(`/api/insects/${id}`, { method: 'PUT', headers: { ...authHeaders() }, body: data });
    return r.json();
  },
  async delete(id) {
    const r = await fetch(`/api/insects/${id}`, { method: 'DELETE', headers: { ...authHeaders() } });
    return r.json();
  },
  async searchByImage(file) {
    const fd = new FormData();
    fd.append('image', file);
    const r = await fetch('/api/search-by-image', { method: 'POST', headers: { ...authHeaders() }, body: fd });
    if (r.status === 401) handleUnauth();
    return r.json();
  },
  async getTaxonomy() {
    const r = await fetch('/api/taxonomy', { headers: authHeaders() });
    if (r.status === 401) handleUnauth();
    return r.json();
  },
  async getHosts() {
    const r = await fetch('/api/taxonomy/hosts', { headers: authHeaders() });
    if (r.status === 401) handleUnauth();
    return r.json();
  },
  async getDamages() {
    const r = await fetch('/api/taxonomy/damages', { headers: authHeaders() });
    if (r.status === 401) handleUnauth();
    return r.json();
  },
  async getCategories() {
    const r = await fetch('/api/taxonomy/categories', { headers: authHeaders() });
    if (r.status === 401) handleUnauth();
    return r.json();
  },
  async getGenus() {
    const r = await fetch('/api/taxonomy/genus', { headers: authHeaders() });
    if (r.status === 401) handleUnauth();
    return r.json();
  },
  async getStats() {
    const r = await fetch('/api/stats', { headers: authHeaders() });
    if (r.status === 401) handleUnauth();
    return r.json();
  },
  async getCustomFields() {
    const r = await fetch('/api/custom-fields', { headers: authHeaders() });
    if (r.status === 401) handleUnauth();
    return r.json();
  },
  async createCustomField(name) {
    const r = await fetch('/api/custom-fields', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    return r.json();
  },
  async updateCustomField(id, name) {
    const r = await fetch(`/api/custom-fields/${id}`, { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    return r.json();
  },
  async deleteCustomField(id) {
    const r = await fetch(`/api/custom-fields/${id}`, { method: 'DELETE', headers: { ...authHeaders() } });
    return r.json();
  },
  async getCustomTaxonomy() {
    const r = await fetch('/api/taxonomy/custom', { headers: authHeaders() });
    if (r.status === 401) handleUnauth();
    return r.json();
  },
  // Auth
  async login(username, password) {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    return r.json();
  },
  async register(username, password) {
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    return r.json();
  },
  async getMe() {
    const r = await fetch('/api/auth/me', { headers: authHeaders() });
    return r.json();
  },
  async getAdminUsers() {
    const r = await fetch('/api/admin/users', { headers: authHeaders() });
    if (r.status === 403) throw new Error('权限不足');
    return r.json();
  },
  async deleteAdminUser(id) {
    const r = await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers: { ...authHeaders() } });
    return r.json();
  },
  async updateUserPerm(id, body) {
    const r = await fetch(`/api/admin/users/${id}/permissions`, { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
  },
  async getLogs(page, limit) {
    const r = await fetch('/api/admin/logs?page=' + (page||1) + '&limit=' + (limit||50), { headers: authHeaders() });
    if (r.status === 403) throw new Error('权限不足');
    return r.json();
  },
  async exportCsv() {
    const r = await fetch('/api/export/xlsx', { headers: authHeaders() });
    if (r.status === 401) handleUnauth();
    if (!r.ok) throw new Error('导出失败');
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insect-db-export-${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast('导出成功');
  }
};

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2500);
}

// ── Auth UI ──
function showAuth() {
  document.getElementById('authOverlay').classList.remove('hidden');
  document.getElementById('loginForm').classList.remove('hidden');
  document.getElementById('registerForm').classList.add('hidden');
  document.getElementById('authError').textContent = '';
  document.getElementById('authError2').textContent = '';
}

function hideAuth() {
  document.getElementById('authOverlay').classList.add('hidden');
}

function updateUIForRole() {
  const isAdmin = currentUser && currentUser.role === 'admin';
  const canUpload = currentUser && (isAdmin || currentUser.can_upload);
  document.getElementById('addBtn').classList.toggle('hidden', !canUpload);
  document.getElementById('userMgmtBtn').classList.toggle('hidden', !isAdmin);
  document.getElementById('logoutBtn').classList.remove('hidden');
  document.getElementById('exportBtn').classList.toggle('hidden', !isAdmin);
  document.getElementById('logBtn').classList.toggle('hidden', !isAdmin);
  // card edit/delete handled in renderCards
}

async function checkAuth() {
  const token = localStorage.getItem('auth_token');
  if (!token) { showAuth(); return false; }
  try {
    const data = await api.getMe();
    if (data.user) {
      currentUser = data.user;
      hideAuth();
      updateUIForRole();
      initializeApp();
      return true;
    }
  } catch (e) { /* fall through */ }
  localStorage.removeItem('auth_token');
  showAuth();
  return false;
}

async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('authError');
  if (!username || !password) { errEl.textContent = '请输入用户名和密码'; return; }
  try {
    const data = await api.login(username, password);
    if (data.error) { errEl.textContent = data.error; return; }
    localStorage.setItem('auth_token', data.token);
    currentUser = data.user;
    hideAuth();
    updateUIForRole();
    initializeApp();
  } catch (e) {
    errEl.textContent = '登录失败';
  }
}

async function handleRegister() {
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value;
  const confirm = document.getElementById('registerConfirm').value;
  const errEl = document.getElementById('authError2');
  if (!username || !password) { errEl.textContent = '请输入用户名和密码'; return; }
  if (password !== confirm) { errEl.textContent = '两次密码不一致'; return; }
  try {
    const data = await api.register(username, password);
    if (data.error) { errEl.textContent = data.error; return; }
    toast('注册成功，请登录');
    document.getElementById('registerUsername').value = '';
    document.getElementById('registerPassword').value = '';
    document.getElementById('registerConfirm').value = '';
    document.getElementById('showLoginBtn').click();
  } catch (e) {
    errEl.textContent = '注册失败';
  }
}

function handleLogout() {
  localStorage.removeItem('auth_token');
  currentUser = null;
  document.getElementById('logoutBtn').classList.add('hidden');
  document.getElementById('addBtn').classList.remove('hidden');
  document.getElementById('userMgmtBtn').classList.add('hidden');
  document.getElementById('cardGrid').innerHTML = '';
  document.getElementById('emptyState').classList.add('hidden');
  showAuth();
}

document.getElementById('loginBtn').addEventListener('click', handleLogin);
document.getElementById('loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
document.getElementById('showRegisterBtn').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('registerForm').classList.remove('hidden');
});
document.getElementById('showLoginBtn').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('registerForm').classList.add('hidden');
  document.getElementById('loginForm').classList.remove('hidden');
});
document.getElementById('registerBtn').addEventListener('click', handleRegister);
document.getElementById('registerConfirm').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleRegister(); });
document.getElementById('logoutBtn').addEventListener('click', handleLogout);
document.getElementById('logBtn').addEventListener('click', openLogModal);
document.getElementById('exportBtn').addEventListener('click', async () => {
  try { await api.exportCsv(); } catch (e) { toast(e.message); }
});

function initializeApp() {
  loadCards();
  loadTaxonomyTree();
  loadCustomFieldTabs();
  // Load sidebar tab
  const activeTab = document.querySelector('.sidebar-tab.active');
  if (activeTab) loadSidebarTab(activeTab.dataset.tab);
}

function showLoading(show) {
  document.getElementById('loading').classList.toggle('hidden', !show);
}

async function loadCards(q) {
  showLoading(true);
  try {
    allInsects = await api.list(q || '', currentFilter.order, currentFilter.family, currentFilter.genus, currentFilter.host_plant, currentFilter.damage_type, currentFilter.category);
    renderCards(allInsects);
  } catch (err) {
    toast('加载失败: ' + err.message);
  } finally {
    showLoading(false);
  }
}

function renderCards(data) {
  const grid = document.getElementById('cardGrid');
  const empty = document.getElementById('emptyState');
  const isAdmin = currentUser && currentUser.role === 'admin';
  const canEdit = currentUser && (isAdmin || currentUser.can_edit);

  if (!data || data.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = data.map(item => `
    <div class="card" onclick="showDetail(${item.id})">
      ${item.image_path
        ? `<img class="card-image" src="${item.image_path}" alt="${item.name}" loading="lazy">`
        : `<div class="card-image-placeholder">🦗</div>`}
      <div class="card-body">
        <h3>${esc(item.name)} ${item.status ? `<span class="status-dot status-${esc(item.status)}" title="${esc(item.status)}"></span>` : ''}</h3>
        ${item.scientific_name ? `<div class="card-sci-name">${esc(item.scientific_name)}</div>` : ''}
        <div class="card-taxonomy">
          ${item.insect_order ? `<span>${esc(item.insect_order)}</span>` : ''}
          ${item.family ? `<span>${esc(item.family)}</span>` : ''}
          ${item.genus ? `<span>${esc(item.genus)}</span>` : ''}
        </div>
        <div class="card-info">
          ${item.host_plant ? `<span>🌿 寄主：${shortenHost(item.host_plant)}</span>` : ''}
          ${item.damage_type ? `<span>⚠️ 危害：${esc(item.damage_type)}</span>` : ''}
        </div>
      </div>
      ${canEdit ? `<div class="card-actions">
        <button class="btn btn-edit" onclick="event.stopPropagation(); openEdit(${item.id})">编辑</button>
        ${isAdmin ? `<button class="btn btn-delete" onclick="event.stopPropagation(); confirmDelete(${item.id})">删除</button>` : ''}
      </div>` : ''}
      ${item.similarity !== undefined ? `<div style="padding:0 14px 10px"><span class="simBdge">相似度 ${(item.similarity * 100).toFixed(0)}%</span></div>` : ''}
    </div>
  `).join('');
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function shortenHost(val) {
  const parts = val.split(/[、,，\/\\]/).map(s => s.trim()).filter(Boolean);
  if (parts.length <= 5) return esc(val);
  return esc(parts.slice(0, 5).join('、') + '等');
}

function toggleCategoryFields() {
  const cat = document.querySelector('input[name="category"]:checked')?.value;
  const row = document.querySelector('.form-row.predator-only');
  if (!row) return;
  const isPest = cat === '害虫';
  const isPredator = cat === '天敌';
  document.querySelectorAll('.pest-only').forEach(e => e.style.display = isPest ? '' : 'none');
  row.style.display = isPredator ? '' : 'none';
}

function openModal(title, data) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalOverlay').classList.remove('hidden');
  loadCustomFieldsInputs(data ? data.custom_values : null);
  if (data) {
    editingId = data.id;
    document.getElementById('editId').value = data.id;
    document.getElementById('name').value = data.name || '';
    document.getElementById('scientificName').value = data.scientific_name || '';
    document.getElementById('aliasName').value = data.alias_name || '';
    document.getElementById('description').value = data.description || '';
    document.getElementById('hostPlant').value = data.host_plant || '';
    document.getElementById('damageType').value = data.damage_type || '';
    document.getElementById('insectOrder').value = data.insect_order || '';
    document.getElementById('family').value = data.family || '';
    document.getElementById('genus').value = data.genus || '';
    document.getElementById('morphology').value = data.morphology || '';
    document.getElementById('habit').value = data.habit || '';
    document.getElementById('preyInsect').value = data.prey_insect || '';
    if (data.predator_stage) {
      const stages = data.predator_stage.split(',');
      document.querySelectorAll('input[name="predator_stage"]').forEach(cb => {
        cb.checked = stages.includes(cb.value);
      });
    }
    if (data.image_path) {
      document.getElementById('imagePreview').innerHTML = `<img src="${data.image_path}" alt="preview">`;
    } else {
      document.getElementById('imagePreview').innerHTML = '';
    }
    const catRadios = document.querySelectorAll('input[name="category"]');
    catRadios.forEach(r => r.checked = r.value === (data.category || ''));
    const statusRadios = document.querySelectorAll('input[name="status"]');
    statusRadios.forEach(r => r.checked = r.value === (data.status || '在库'));
  }
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.getElementById('insectForm').reset();
  document.getElementById('editId').value = '';
  document.getElementById('imagePreview').innerHTML = '';
  editingId = null;
}

document.querySelectorAll('input[name="category"]').forEach(r => {
  r.addEventListener('change', toggleCategoryFields);
});

document.getElementById('addBtn').addEventListener('click', () => {
  openModal('添加标本');
  setTimeout(toggleCategoryFields, 50);
});

document.getElementById('insectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData();
  fd.append('name', document.getElementById('name').value.trim());
  fd.append('scientific_name', document.getElementById('scientificName').value.trim());
  fd.append('alias_name', document.getElementById('aliasName').value.trim());
  fd.append('description', document.getElementById('description').value.trim());
  fd.append('host_plant', document.getElementById('hostPlant').value.trim());
  fd.append('damage_type', document.getElementById('damageType').value.trim());
  fd.append('insect_order', document.getElementById('insectOrder').value.trim());
  fd.append('family', document.getElementById('family').value.trim());
  fd.append('genus', document.getElementById('genus').value.trim());
  fd.append('morphology', document.getElementById('morphology').value.trim());
  fd.append('habit', document.getElementById('habit').value.trim());
  fd.append('category', document.querySelector('input[name="category"]:checked')?.value || '');
  fd.append('prey_insect', document.getElementById('preyInsect').value.trim());
  const predatorStages = [...document.querySelectorAll('input[name="predator_stage"]:checked')].map(cb => cb.value).join(',');
  fd.append('predator_stage', predatorStages);
  fd.append('status', document.querySelector('input[name="status"]:checked')?.value || '在库');

  const img = document.getElementById('image');
  if (img.files[0]) fd.append('image', img.files[0]);

  const customInputs = document.querySelectorAll('.custom-field-input');
  const customValues = {};
  customInputs.forEach(inp => {
    if (inp.value.trim()) customValues[inp.dataset.fieldId] = inp.value.trim();
  });
  if (Object.keys(customValues).length > 0) {
    fd.append('custom_values', JSON.stringify(customValues));
  }

  try {
    let res;
    if (editingId) {
      res = await api.update(editingId, fd);
    } else {
      res = await api.save(fd);
    }
    if (res.error) { toast(res.error); return; }
    toast(editingId ? '更新成功' : '添加成功');
    closeModal();
    loadCards();
    loadCurrentTab();
    loadCustomFieldTabs();
  } catch (err) {
    toast('操作失败: ' + err.message);
  }
});

document.getElementById('image').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) { document.getElementById('imagePreview').innerHTML = ''; return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('imagePreview').innerHTML = `<img src="${ev.target.result}" alt="preview">`;
  };
  reader.readAsDataURL(file);
});

async function showDetail(id) {
  if (lastQueryHash && lastSearchResultIds.has(id)) {
    fetch('/api/search-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queryHash: lastQueryHash, resultId: id })
    }).then(r => r.json()).then(d => {
      if (d.weights) {
        const el = document.getElementById('gwoIndicator');
        const txt = document.getElementById('gwoText');
        el.classList.remove('hidden');
        txt.textContent = `H:${d.weights[0].toFixed(2)} V:${d.weights[1].toFixed(2)} D:${d.weights[2].toFixed(2)} A:${d.weights[3].toFixed(2)}`;
      }
    }).catch(() => {});
  }
  try {
    const data = await api.get(id);
    document.getElementById('detailTitle').textContent = data.name;
    document.getElementById('detailBody').innerHTML = `
      ${data.image_path ? `<div class="detail-section"><img src="${data.image_path}" alt="${esc(data.name)}"></div>` : ''}
      <div class="detail-meta">
        ${data.insect_order ? `<div class="detail-meta-item"><div class="label">目</div><div class="value">${esc(data.insect_order)}</div></div>` : ''}
        ${data.family ? `<div class="detail-meta-item"><div class="label">科</div><div class="value">${esc(data.family)}</div></div>` : ''}
        ${data.genus ? `<div class="detail-meta-item"><div class="label">属</div><div class="value"><i>${esc(data.genus)}</i></div></div>` : ''}
        ${data.scientific_name ? `<div class="detail-meta-item"><div class="label">学名</div><div class="value"><i>${esc(data.scientific_name)}</i></div></div>` : ''}
        ${data.alias_name ? `<div class="detail-meta-item"><div class="label">别名</div><div class="value">${esc(data.alias_name)}</div></div>` : ''}
        ${data.host_plant ? `<div class="detail-meta-item"><div class="label">寄主植物</div><div class="value">${esc(data.host_plant)}</div></div>` : ''}
        ${data.damage_type ? `<div class="detail-meta-item"><div class="label">危害类型</div><div class="value">${esc(data.damage_type)}</div></div>` : ''}
        ${data.status ? `<div class="detail-meta-item"><div class="label">在库情况</div><div class="value">${esc(data.status)}</div></div>` : ''}
      </div>
      ${data.morphology ? `<div class="detail-section"><h3>形态特征</h3><p>${esc(data.morphology)}</p></div>` : ''}
      ${data.habit ? `<div class="detail-section"><h3>生活习性</h3><p>${esc(data.habit)}</p></div>` : ''}
      ${data.description ? `<div class="detail-section"><h3>详细描述</h3><p>${esc(data.description)}</p></div>` : ''}
    `;
    document.getElementById('detailModal').classList.remove('hidden');
  } catch (err) {
    toast('加载失败: ' + err.message);
  }
}

function closeDetail() {
  document.getElementById('detailModal').classList.add('hidden');
}

async function openEdit(id) {
  try {
    const data = await api.get(id);
    openModal('编辑标本', data);
  } catch (err) {
    toast('加载失败: ' + err.message);
  }
}

function showConfirm(msg) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmMessage').textContent = msg;
    modal.classList.remove('hidden');
    const ok = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');
    const cleanup = result => {
      modal.classList.add('hidden');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
  });
}

async function confirmDelete(id) {
  if (!await showConfirm('确定要删除此标本记录吗？')) return;
  try {
    const res = await api.delete(id);
    if (res.error) { toast(res.error); return; }
    toast('删除成功');
    loadCards();
    loadCurrentTab();
    loadCustomFieldTabs();
  } catch (err) {
    toast('删除失败: ' + err.message);
  }
}

document.getElementById('searchBtn').addEventListener('click', () => {
  loadCards(document.getElementById('searchInput').value.trim());
});

document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadCards(e.target.value.trim());
});

document.getElementById('imageSearchBtn').addEventListener('click', () => {
  const panel = document.getElementById('imageSearchPanel');
  panel.classList.toggle('hidden');
});

document.getElementById('closeImageSearch').addEventListener('click', () => {
  document.getElementById('imageSearchPanel').classList.add('hidden');
  resetImageSearch();
});

document.getElementById('imageSearchFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  currentSearchImage = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('searchPreview').innerHTML = `<img src="${ev.target.result}" alt="search">`;
    document.getElementById('startSearchBtn').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

document.getElementById('startSearchBtn').addEventListener('click', async () => {
  if (!currentSearchImage) { toast('请先上传图片'); return; }
  showLoading(true);
  try {
    const res = await api.searchByImage(currentSearchImage);
    const results = Array.isArray(res) ? res : (res.results || []);
    lastQueryHash = res.queryHash || '';
    lastSearchResultIds = new Set(results.map(r => r.id));
    if (res.weights) {
      const el = document.getElementById('gwoIndicator');
      const txt = document.getElementById('gwoText');
      el.classList.remove('hidden');
      txt.textContent = `H:${res.weights[0].toFixed(2)} V:${res.weights[1].toFixed(2)} D:${res.weights[2].toFixed(2)} A:${res.weights[3].toFixed(2)}`;
    }
    document.getElementById('imageSearchPanel').classList.add('hidden');
    renderCards(results);
    if (results.length === 0) toast('未找到匹配的标本');
    resetImageSearch();
  } catch (err) {
    toast('检索失败: ' + err.message);
  } finally {
    showLoading(false);
  }
});

function resetImageSearch() {
  currentSearchImage = null;
  document.getElementById('searchPreview').innerHTML = '';
  document.getElementById('startSearchBtn').classList.add('hidden');
  document.getElementById('imageSearchFile').value = '';
}

document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

document.getElementById('detailModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeDetail();
});

// Sidebar Toggle
const sidebar = document.getElementById('taxonomySidebar');
document.getElementById('sidebarToggleBtn').addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  const btn = document.getElementById('sidebarToggleBtn');
  btn.title = sidebar.classList.contains('collapsed') ? '展开侧栏' : '收起侧栏';
});
document.getElementById('sidebarToggleBtnMobile').addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  const btn = document.getElementById('sidebarToggleBtn');
  btn.title = sidebar.classList.contains('collapsed') ? '展开侧栏' : '收起侧栏';
});

// Sidebar Tabs
document.querySelectorAll('.sidebar-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    loadSidebarTab(tab.dataset.tab);
  });
});

function loadSidebarTab(tab) {
  const body = document.getElementById('taxonomyBody');
  body.innerHTML = '<div class="taxonomy-loading">加载中...</div>';
  if (tab === 'taxonomy') loadTaxonomyTree();
  else if (tab === 'hosts') loadHosts();
  else if (tab === 'damages') loadDamages();
  else if (tab === 'categories') loadCategories();
  else if (tab.startsWith('custom_')) {
    const fieldId = tab.replace('custom_', '');
    const activeTab = document.querySelector('.sidebar-tab.active');
    const fieldName = activeTab ? activeTab.dataset.fieldName : '';
    loadCustomFieldTab(fieldId, fieldName);
  }
}

// Taxonomy tree (目/科)
async function loadTaxonomyTree() {
  const body = document.getElementById('taxonomyBody');
  try {
    const taxonomy = await api.getTaxonomy();
    const entries = Object.entries(taxonomy);
    if (entries.length === 0) {
      body.innerHTML = '<div class="taxonomy-loading">暂无分类数据</div>';
      return;
    }
    body.innerHTML = entries.map(([order, families]) => {
      const famEntries = Object.entries(families);
      const famCount = famEntries.length;
      const genusCount = famEntries.reduce((s, [, g]) => s + g.length, 0);
      const orderActive = currentFilter.order === order;
      return `
        <div class="taxonomy-order">
          <div class="taxonomy-order-header${orderActive && !currentFilter.family && !currentFilter.genus ? ' active' : ''}" data-order="${esc(order)}">
            <span class="arrow ${orderActive ? 'expanded' : ''}">▶</span>
            <span>${esc(order)}</span>
            <span class="count">${famCount}科 ${genusCount}属</span>
          </div>
          <div class="taxonomy-families" style="display: ${orderActive ? 'block' : 'none'}">
            ${famEntries.map(([family, genera]) => `
              <div class="taxonomy-family-group">
                <div class="taxonomy-family-header${currentFilter.family === family && !currentFilter.genus ? ' active' : ''}" data-order="${esc(order)}" data-family="${esc(family)}">
                  <span class="arrow ${currentFilter.family === family ? 'expanded' : ''}">▶</span>
                  <span>${esc(family)}</span>
                  <span class="count">${genera.length}属</span>
                </div>
                <div class="taxonomy-genera" style="display: ${currentFilter.family === family ? 'block' : 'none'}">
                  ${genera.map(g => `
                    <button class="taxonomy-genus${currentFilter.genus === g ? ' active' : ''}" data-order="${esc(order)}" data-family="${esc(family)}" data-genus="${esc(g)}">${esc(g)}</button>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    body.querySelectorAll('.taxonomy-order-header').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.taxonomy-family-group')) return;
        const order = el.dataset.order;
        const famPanel = el.nextElementSibling;
        const arrow = el.querySelector('.arrow');
        const isOpen = famPanel.style.display === 'block';
        if (isOpen && currentFilter.order === order) {
          setFilter('order', '');
        } else {
          setFilter('order', order);
        }
      });
    });

    body.querySelectorAll('.taxonomy-family-header').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const order = el.dataset.order;
        const family = el.dataset.family;
        const genusPanel = el.nextElementSibling;
        const isOpen = genusPanel.style.display === 'block';
        if (isOpen && currentFilter.family === family) {
          currentFilter.order = order;
          currentFilter.family = '';
          currentFilter.genus = '';
          updateFilterUI();
          loadCards(document.getElementById('searchInput').value.trim());
          loadCurrentTab();
        } else {
          currentFilter.order = order;
          currentFilter.family = family;
          currentFilter.genus = '';
          updateFilterUI();
          loadCards(document.getElementById('searchInput').value.trim());
          loadCurrentTab();
        }
      });
    });

    body.querySelectorAll('.taxonomy-genus').forEach(el => {
      el.addEventListener('click', () => {
        const genus = el.dataset.genus;
        if (currentFilter.genus === genus) {
          currentFilter.genus = '';
        } else {
          currentFilter.order = el.dataset.order;
          currentFilter.family = el.dataset.family;
          currentFilter.genus = genus;
        }
        updateFilterUI();
        loadCards(document.getElementById('searchInput').value.trim());
        loadCurrentTab();
      });
    });
  } catch (err) {
    body.innerHTML = '<div class="taxonomy-loading">加载失败</div>';
  }
}

// Hosts list
async function loadHosts() {
  const body = document.getElementById('taxonomyBody');
  try {
    const hosts = await api.getHosts();
    if (hosts.length === 0) {
      body.innerHTML = '<div class="taxonomy-loading">暂无寄主数据</div>';
      return;
    }
    body.innerHTML = `<div class="taxonomy-flat-list">
      ${hosts.map(h => `
        <button class="taxonomy-flat-item${currentFilter.host_plant === h ? ' active' : ''}" data-host="${esc(h)}">🌿 ${esc(h)}</button>
      `).join('')}
    </div>`;
    body.querySelectorAll('.taxonomy-flat-item').forEach(el => {
      el.addEventListener('click', () => {
        setFilter('host_plant', el.dataset.host);
      });
    });
  } catch (err) {
    body.innerHTML = '<div class="taxonomy-loading">加载失败</div>';
  }
}

// Damages list
async function loadDamages() {
  const body = document.getElementById('taxonomyBody');
  try {
    const damages = await api.getDamages();
    if (damages.length === 0) {
      body.innerHTML = '<div class="taxonomy-loading">暂无危害数据</div>';
      return;
    }
    body.innerHTML = `<div class="taxonomy-flat-list">
      ${damages.map(d => `
        <button class="taxonomy-flat-item${currentFilter.damage_type === d ? ' active' : ''}" data-damage="${esc(d)}">⚠️ ${esc(d)}</button>
      `).join('')}
    </div>`;
    body.querySelectorAll('.taxonomy-flat-item').forEach(el => {
      el.addEventListener('click', () => {
        setFilter('damage_type', el.dataset.damage);
      });
    });
  } catch (err) {
    body.innerHTML = '<div class="taxonomy-loading">加载失败</div>';
  }
}

// Categories list
async function loadCategories() {
  const body = document.getElementById('taxonomyBody');
  try {
    const cats = await api.getCategories();
    if (cats.length === 0) {
      body.innerHTML = '<div class="taxonomy-loading">暂无类别数据</div>';
      return;
    }
    body.innerHTML = `<div class="taxonomy-flat-list">
      ${cats.map(c => `
        <button class="taxonomy-flat-item${currentFilter.category === c ? ' active' : ''}" data-category="${esc(c)}">${c === '害虫' ? '🐛' : '🛡️'} ${esc(c)}</button>
      `).join('')}
    </div>`;
    body.querySelectorAll('.taxonomy-flat-item').forEach(el => {
      el.addEventListener('click', () => {
        setFilter('category', el.dataset.category);
      });
    });
  } catch (err) {
    body.innerHTML = '<div class="taxonomy-loading">加载失败</div>';
  }
}

async function loadCustomFieldTab(fieldId, fieldName) {
  const body = document.getElementById('taxonomyBody');
  try {
    const data = await api.getCustomTaxonomy();
    const values = data[fieldName] || [];
    if (values.length === 0) {
      body.innerHTML = '<div class="taxonomy-loading">暂无数据</div>';
      return;
    }
    body.innerHTML = `<div class="taxonomy-flat-list">
      ${values.map(v => `
        <button class="taxonomy-flat-item">${esc(v)}</button>
      `).join('')}
    </div>`;
  } catch (err) {
    body.innerHTML = '<div class="taxonomy-loading">加载失败</div>';
  }
}

// Dynamically add custom field tabs
async function loadCustomFieldTabs() {
  const tabsContainer = document.querySelector('.sidebar-tabs');
  try {
    const fields = await api.getCustomFields();
    tabsContainer.querySelectorAll('.sidebar-tab-dynamic').forEach(el => el.remove());
    for (const f of fields) {
      const tab = document.createElement('button');
      tab.className = 'sidebar-tab sidebar-tab-dynamic';
      tab.dataset.tab = `custom_${f.id}`;
      tab.dataset.fieldName = f.name;
      tab.textContent = f.name;
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadCustomFieldTab(f.id, f.name);
      });
      tabsContainer.appendChild(tab);
    }
  } catch (err) {
    // ignore
  }
}

function setFilter(key, value) {
  if (key === 'order') {
    currentFilter.order = value;
    currentFilter.family = '';
    currentFilter.genus = '';
  } else if (key === 'family') {
    currentFilter.family = value;
    currentFilter.genus = '';
  } else if (key === 'genus') {
    currentFilter.genus = currentFilter.genus === value ? '' : value;
  } else if (key === 'host_plant') {
    currentFilter.host_plant = currentFilter.host_plant === value ? '' : value;
  } else if (key === 'damage_type') {
    currentFilter.damage_type = currentFilter.damage_type === value ? '' : value;
  } else if (key === 'category') {
    currentFilter.category = currentFilter.category === value ? '' : value;
  }
  updateFilterUI();
  loadCards(document.getElementById('searchInput').value.trim());
  loadCurrentTab();
}

function updateFilterUI() {
  const el = document.getElementById('currentFilter');
  const text = document.getElementById('filterText');
  const clearTaxonomy = document.getElementById('clearTaxonomy');
  const parts = [];
  if (currentFilter.order) parts.push(`目：${currentFilter.order}`);
  if (currentFilter.family) parts.push(`科：${currentFilter.family}`);
  if (currentFilter.genus) parts.push(`属：${currentFilter.genus}`);
  if (currentFilter.host_plant) parts.push(`寄主：${currentFilter.host_plant}`);
  if (currentFilter.damage_type) parts.push(`危害：${currentFilter.damage_type}`);
  if (currentFilter.category) parts.push(`类别：${currentFilter.category}`);
  if (parts.length > 0) {
    el.classList.remove('hidden');
    clearTaxonomy.classList.remove('hidden');
    text.textContent = parts.join(' | ');
  } else {
    el.classList.add('hidden');
    clearTaxonomy.classList.add('hidden');
  }
}

function loadCurrentTab() {
  const active = document.querySelector('.sidebar-tab.active');
  if (active) loadSidebarTab(active.dataset.tab);
}

document.getElementById('clearFilterBtn').addEventListener('click', () => {
  currentFilter = { order: '', family: '', genus: '', host_plant: '', damage_type: '', category: '' };
  updateFilterUI();
  loadCards();
  loadCurrentTab();
});

document.getElementById('clearTaxonomy').addEventListener('click', () => {
  currentFilter = { order: '', family: '', genus: '', host_plant: '', damage_type: '', category: '' };
  updateFilterUI();
  loadCards();
  loadCurrentTab();
});

// Start
checkAuth();

// Custom Fields management
async function loadCustomFieldsInputs(customValues) {
  const container = document.getElementById('customFieldsContainer');
  try {
    const fields = await api.getCustomFields();
    if (fields.length === 0) {
      container.innerHTML = '<div class="custom-fields-empty">暂无自定义项目，点击"管理"添加</div>';
      return;
    }
    container.innerHTML = fields.map(f => `
      <div class="form-group">
        <label>${esc(f.name)}</label>
        <input type="text" class="custom-field-input" data-field-id="${f.id}" value="${esc(customValues && customValues[f.id] ? customValues[f.id] : '')}" placeholder="请输入${esc(f.name)}">
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="custom-fields-empty">加载失败</div>';
  }
}

document.getElementById('manageCustomFieldsBtn').addEventListener('click', () => {
  document.getElementById('customFieldsModal').classList.remove('hidden');
  loadCustomFieldsList();
});

function closeCustomFieldsModal() {
  document.getElementById('customFieldsModal').classList.add('hidden');
  loadCustomFieldTabs();
}

async function loadCustomFieldsList() {
  const list = document.getElementById('customFieldsList');
  try {
    const fields = await api.getCustomFields();
    if (fields.length === 0) {
      list.innerHTML = '<div class="custom-fields-empty" style="padding:20px;text-align:center;color:var(--gray-400)">暂无自定义项目</div>';
      return;
    }
    list.innerHTML = fields.map(f => `
      <div class="custom-field-row">
        <input type="text" class="custom-field-edit" data-id="${f.id}" value="${esc(f.name)}">
        <button class="btn btn-sm btn-save-field" data-id="${f.id}">保存</button>
        <button class="btn btn-sm btn-delete-field" data-id="${f.id}">删除</button>
      </div>
    `).join('');
    list.querySelectorAll('.btn-save-field').forEach(btn => {
      btn.addEventListener('click', async () => {
        const inp = btn.parentElement.querySelector('.custom-field-edit');
        const name = inp.value.trim();
        if (!name) return;
        await api.updateCustomField(btn.dataset.id, name);
        loadCustomFieldsList();
        loadCustomFieldTabs();
      });
    });
    list.querySelectorAll('.btn-delete-field').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await showConfirm('确定删除此自定义项目？关联数据也将清除。')) return;
        await api.deleteCustomField(btn.dataset.id);
        loadCustomFieldsList();
        loadCustomFieldsInputs();
        loadCustomFieldTabs();
      });
    });
  } catch (err) {
    list.innerHTML = '<div class="custom-fields-empty" style="padding:20px;text-align:center;color:var(--gray-400)">加载失败</div>';
  }
}

document.getElementById('addCustomFieldBtn').addEventListener('click', async () => {
  const inp = document.getElementById('newCustomFieldName');
  const name = inp.value.trim();
  if (!name) return;
  await api.createCustomField(name);
  inp.value = '';
  loadCustomFieldsList();
  loadCustomFieldTabs();
});

document.getElementById('newCustomFieldName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('addCustomFieldBtn').click();
});

// Stats
document.getElementById('statsBtn').addEventListener('click', openStats);

function closeStats() {
  document.getElementById('statsModal').classList.add('hidden');
}

async function openStats() {
  document.getElementById('statsModal').classList.remove('hidden');
  const body = document.getElementById('statsBody');
  try {
    const stats = await api.getStats();
    body.innerHTML = renderStats(stats);
  } catch (err) {
    body.innerHTML = `<div class="taxonomy-loading">加载失败: ${err.message}</div>`;
  }
}

function renderStats(stats) {
  const maxOrder = stats.byOrder.length > 0 ? stats.byOrder[0].count : 1;
  const maxFamily = stats.byFamily.length > 0 ? stats.byFamily[0].count : 1;
  const maxHost = stats.byHost.length > 0 ? stats.byHost[0].count : 1;
  const maxDamage = stats.byDamage.length > 0 ? stats.byDamage[0].count : 1;
  const maxCategory = stats.byCategory && stats.byCategory.length > 0 ? stats.byCategory[0].count : 1;
  const maxGenus = stats.byGenus && stats.byGenus.length > 0 ? stats.byGenus[0].count : 1;

  let customCharts = '';
  if (stats.byCustom) {
    for (const [name, values] of Object.entries(stats.byCustom)) {
      const max = values.length > 0 ? values[0].count : 1;
      customCharts += `<div class="stats-chart"><h4>${esc(name)}分布</h4><div class="chart-row"><div class="chart-col chart-col-bar">${renderBarChart(values, 'value', max)}</div><div class="chart-col chart-col-pie">${renderPieChart(values, 'value')}</div></div></div>`;
    }
  }

  return `
    <div class="stats-summary">
      <div class="stats-card"><div class="stats-card-value">${stats.total}</div><div class="stats-card-label">🦗 标本总数</div></div>
      <div class="stats-card"><div class="stats-card-value">${stats.byOrder.length}</div><div class="stats-card-label">📑 昆虫目数</div></div>
      <div class="stats-card"><div class="stats-card-value">${stats.byFamily.length}</div><div class="stats-card-label">📑 昆虫科数</div></div>
      <div class="stats-card"><div class="stats-card-value">${stats.byHost.length}</div><div class="stats-card-label">🌿 寄主种类</div></div>
      <div class="stats-card"><div class="stats-card-value">${stats.byDamage.length}</div><div class="stats-card-label">⚠️ 危害类型</div></div>
    </div>

    <div class="stats-charts">
      <div class="stats-chart">
        <h4>按目分布</h4>
        <div class="chart-row"><div class="chart-col chart-col-bar">${renderBarChart(stats.byOrder, 'insect_order', maxOrder)}</div><div class="chart-col chart-col-pie">${renderPieChart(stats.byOrder, 'insect_order')}</div></div>
      </div>
      <div class="stats-chart">
        <h4>按科分布</h4>
        <div class="chart-row"><div class="chart-col chart-col-bar">${renderBarChart(stats.byFamily, 'family', maxFamily)}</div><div class="chart-col chart-col-pie">${renderPieChart(stats.byFamily, 'family')}</div></div>
      </div>
      <div class="stats-chart">
        <h4>按寄主分布</h4>
        <div class="chart-row"><div class="chart-col chart-col-bar">${renderBarChart(stats.byHost, 'name', maxHost)}</div><div class="chart-col chart-col-pie">${renderPieChart(stats.byHost, 'name')}</div></div>
      </div>
      <div class="stats-chart">
        <h4>按危害类型分布</h4>
        <div class="chart-row"><div class="chart-col chart-col-bar">${renderBarChart(stats.byDamage, 'name', maxDamage)}</div><div class="chart-col chart-col-pie">${renderPieChart(stats.byDamage, 'name')}</div></div>
      </div>
      <div class="stats-chart">
        <h4>按类别分布</h4>
        <div class="chart-row"><div class="chart-col chart-col-bar">${renderBarChart(stats.byCategory || [], 'category', maxCategory)}</div><div class="chart-col chart-col-pie">${renderPieChart(stats.byCategory || [], 'category')}</div></div>
      </div>
      <div class="stats-chart">
        <h4>按属分布</h4>
        ${renderBarChart(stats.byGenus || [], 'genus', maxGenus)}
      </div>
      ${customCharts}
    </div>
  `;
}

const CHART_COLORS = [
  '#5cc490', '#8a7db8', '#f0ad20', '#cc8a8a',
  '#6cc4a0', '#b8a0cc', '#d8b090', '#ace0b8',
  '#e0b8b0', '#a0c090', '#d098b0', '#3daa72'
];

function renderBarChart(data, nameField, max) {
  if (data.length === 0) return '<div class="stats-empty">暂无数据</div>';
  return `<div class="bar-chart">
    ${data.map((item, i) => {
      const pct = (item.count / max * 100).toFixed(1);
      const c = CHART_COLORS[i % CHART_COLORS.length];
      return `
        <div class="bar-row">
          <div class="bar-label" title="${esc(item[nameField])}">${esc(item[nameField])}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%;background:${c}"></div>
          </div>
          <div class="bar-value">${item.count}</div>
        </div>
      `;
    }).join('')}
  </div>`;
}

function renderPieChart(data, nameField) {
  if (data.length === 0) return '<div class="stats-empty">暂无数据</div>';
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return '<div class="stats-empty">暂无数据</div>';

  const n = data.length;
  const sectorAngle = (2 * Math.PI) / n;
  const maxCount = Math.max(...data.map(d => d.count));
  const cx = 80, cy = 80, maxR = 68, minR = 14;
  const gap = 0.02;

  let paths = '';
  let legend = '';

  data.forEach((item, i) => {
    const r = minR + (item.count / maxCount) * (maxR - minR);
    const a1 = -Math.PI / 2 + i * sectorAngle + gap;
    const a2 = -Math.PI / 2 + (i + 1) * sectorAngle - gap;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);
    const color = CHART_COLORS[i % CHART_COLORS.length];

    paths += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 0,1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${color}" stroke="#fff" stroke-width="1.2"/>`;

    const pct = (item.count / total * 100).toFixed(1);
    legend += `<div class="pie-legend-item"><span class="pie-dot" style="background:${color}"></span>${esc(item[nameField])} <span class="pie-value">${item.count} (${pct}%)</span></div>`;
  });

  return `<div class="pie-chart-wrapper">
    <svg viewBox="0 0 160 160" class="pie-svg">${paths}</svg>
    <div class="pie-legend">${legend}</div>
  </div>`;
}

// ── Admin user management ──
document.getElementById('userMgmtBtn').addEventListener('click', openUserMgmt);

function closeUserMgmt() {
  document.getElementById('userMgmtModal').classList.add('hidden');
}

async function openUserMgmt() {
  document.getElementById('userMgmtModal').classList.remove('hidden');
  const body = document.getElementById('userMgmtBody');
  try {
    const users = await api.getAdminUsers();
    body.innerHTML = `<table class="user-table">
      <thead><tr><th>ID</th><th>用户名</th><th>角色</th><th>编辑</th><th>上传</th><th>注册时间</th><th>操作</th></tr></thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td>${u.id}</td>
            <td>${esc(u.username)}</td>
            <td>${u.role === 'admin' ? '管理员' : '普通用户'}</td>
            <td>${u.role !== 'admin' ? `<label class="toggle-switch"><input type="checkbox" ${u.can_edit ? 'checked' : ''} onchange="setPerm(${u.id},'can_edit',this.checked)"><span class="toggle-slider"></span></label>` : '-'}</td>
            <td>${u.role !== 'admin' ? `<label class="toggle-switch"><input type="checkbox" ${u.can_upload ? 'checked' : ''} onchange="setPerm(${u.id},'can_upload',this.checked)"><span class="toggle-slider"></span></label>` : '-'}</td>
            <td>${esc(u.created_at)}</td>
            <td>${u.role !== 'admin' ? `<button class="btn btn-sm btn-delete" onclick="adminDeleteUser(${u.id})">删除</button>` : '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  } catch (err) {
    body.innerHTML = `<div class="taxonomy-loading">${err.message}</div>`;
  }
}

async function setPerm(id, field, val) {
  const body = {};
  if (field === 'can_edit') body.can_edit = val;
  if (field === 'can_upload') body.can_upload = val;
  try {
    await api.updateUserPerm(id, body);
    toast('权限更新成功');
  } catch (err) {
    toast('权限更新失败');
    openUserMgmt();
  }
}

function closeLogModal() {
  document.getElementById('logModal').classList.add('hidden');
}

async function openLogModal() {
  document.getElementById('logModal').classList.remove('hidden');
  const body = document.getElementById('logBody');
  try {
    const data = await api.getLogs(1, 100);
    if (data.logs.length === 0) {
      body.innerHTML = '<div class="taxonomy-empty">暂无操作记录</div>';
      return;
    }
    body.innerHTML = '<table class="user-table"><thead><tr><th>时间</th><th>用户</th><th>操作</th><th>目标</th><th>详情</th></tr></thead><tbody>'
      + data.logs.map(l => '<tr><td>'
        + esc(l.created_at) + '</td><td>'
        + esc(l.username || '系统') + '</td><td>'
        + esc(l.action) + '</td><td>'
        + esc(l.target_type) + ' #' + l.target_id + '</td><td>'
        + esc(l.detail || '-') + '</td></tr>').join('')
      + '</tbody></table>';
  } catch (err) {
    body.innerHTML = '<div class="taxonomy-loading">' + err.message + '</div>';
  }
}

async function adminDeleteUser(id) {
  if (!await showConfirm('确定删除此用户？')) return;
  try {
    const res = await api.deleteAdminUser(id);
    if (res.error) { toast(res.error); return; }
    toast('删除成功');
    openUserMgmt();
  } catch (err) {
    toast('删除失败');
  }
}

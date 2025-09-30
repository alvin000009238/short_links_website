const form = document.getElementById('create-form');
const messageEl = document.getElementById('form-message');
const linksContainer = document.getElementById('links-container');
const template = document.getElementById('link-template');
const searchInput = document.getElementById('search');
const refreshBtn = document.getElementById('refresh');
const dialog = document.getElementById('dialog');
const dialogTitle = document.getElementById('dialog-title');
const dialogBody = document.getElementById('dialog-body');
const dialogClose = document.getElementById('dialog-close');
const domainChip = document.getElementById('active-domain');
const editDialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-form');
const editCancel = document.getElementById('edit-cancel');
const editMessage = document.getElementById('edit-message');

let currentLinks = [];
let isLoading = false;
let editingLinkId = null;
let currentDomain = '';

init();

function init() {
  loadDomainInformation();
  fetchLinks();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = collectLinkPayload(form, {
    allowEmptyPath: false,
    allowEmptyTitle: false,
    allowNullExpires: false,
    emptyTagsAsArray: false,
    allowEmptyDescription: false,
  });

  if (!payload.originalURL) {
    showFormMessage('請輸入原始網址', true);
    return;
  }

  try {
    setFormDisabled(form, true);
    showFormMessage('建立中，請稍候…');
    const response = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await safeParseJSON(response);
      throw new Error(data?.message || '建立短網址時發生錯誤');
    }

    const created = await response.json();
    showFormMessage('建立成功！', false);
    form.reset();
    await fetchLinks();
    focusLink(parseLinkId(created));
  } catch (error) {
    console.error(error);
    showFormMessage(error.message || '建立短網址時發生未知錯誤', true);
  } finally {
    setFormDisabled(form, false);
  }
});

refreshBtn.addEventListener('click', () => fetchLinks());
searchInput.addEventListener('input', debounce(() => fetchLinks(), 400));
linksContainer.addEventListener('click', handleLinkContainerClick);
dialogClose.addEventListener('click', closeDialog);
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) closeDialog();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!dialog.hasAttribute('hidden')) closeDialog();
    if (!editDialog.hasAttribute('hidden')) closeEditDialog();
  }
});

if (editCancel) {
  editCancel.addEventListener('click', () => closeEditDialog());
}

if (editDialog) {
  editDialog.addEventListener('click', (event) => {
    if (event.target === editDialog) closeEditDialog();
  });
}

if (editForm) {
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!editingLinkId) {
      showEditMessage('找不到要更新的短網址，請重新選取。', true);
      return;
    }

    const payload = collectLinkPayload(editForm, {
      allowEmptyPath: true,
      allowEmptyTitle: true,
      allowNullExpires: true,
      emptyTagsAsArray: true,
      allowEmptyDescription: true,
    });

    if (!payload.originalURL) {
      showEditMessage('原始網址為必填欄位。', true);
      return;
    }

    try {
      setFormDisabled(editForm, true);
      showEditMessage('儲存中，請稍候…');
      const response = await fetch(`/api/links/${editingLinkId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await safeParseJSON(response);
        throw new Error(data?.message || '更新短網址失敗');
      }

      showEditMessage('更新完成！', false);
      await fetchLinks();
      focusLink(editingLinkId);
      closeEditDialog();
    } catch (error) {
      console.error(error);
      showEditMessage(error.message || '更新短網址時發生未知錯誤', true);
    } finally {
      if (!editDialog.hasAttribute('hidden')) {
        setFormDisabled(editForm, false);
      }
    }
  });
}

async function loadDomainInformation() {
  if (!domainChip) return;

  try {
    const configResponse = await fetch('/api/config');
    if (configResponse.ok) {
      const config = await configResponse.json();
      if (config?.domain) {
        currentDomain = config.domain;
      }
    }
  } catch (error) {
    console.error('載入網域設定失敗', error);
  }

  try {
    const domainsResponse = await fetch('/api/domains');
    if (!domainsResponse.ok) throw new Error('取得網域列表失敗');
    const data = await domainsResponse.json();
    const domains = extractDomainArray(data);
    const matched = findMatchingDomain(domains, currentDomain);
    domainChip.textContent = formatDomainLabel(matched, currentDomain);
    return;
  } catch (error) {
    console.error(error);
  }

  domainChip.textContent = currentDomain ? `使用網域：${currentDomain}` : '已連線至 Short.io';
}

async function fetchLinks() {
  if (isLoading) return;
  isLoading = true;
  renderPlaceholder();

  try {
    const params = new URLSearchParams();
    const search = searchInput.value.trim();
    if (search) params.set('search', search);

    const query = params.toString();
    const response = await fetch(query ? `/api/links?${query}` : '/api/links');
    if (!response.ok) {
      const errorData = await safeParseJSON(response);
      throw new Error(errorData?.message || '載入短網址列表失敗');
    }
    const data = await response.json();
    const list = Array.isArray(data?.links) ? data.links : data?.data || data || [];
    currentLinks = Array.isArray(list) ? list : [];
    renderLinks();
  } catch (error) {
    console.error(error);
    renderError(error.message || '載入資料時發生未知錯誤');
  } finally {
    isLoading = false;
  }
}

function renderLinks() {
  linksContainer.innerHTML = '';

  if (!currentLinks.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '目前沒有符合條件的短網址。';
    linksContainer.appendChild(empty);
    return;
  }

  currentLinks.forEach((link) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const titleEl = node.querySelector('.link-title');
    const shortEl = node.querySelector('.link-short');
    const originalEl = node.querySelector('.link-original');
    const tagsEl = node.querySelector('.link-tags');
    const createdEl = node.querySelector('.link-created');
    const detailsSection = node.querySelector('.link-details');

    const linkId = parseLinkId(link);
    node.dataset.linkId = linkId;
    titleEl.textContent = link.title || '未命名短網址';
    const shortUrl = link.shortURL || link.shortUrl || composeShortUrl(link);
    shortEl.textContent = shortUrl;
    shortEl.dataset.href = shortUrl;
    originalEl.textContent = link.originalURL || link.originalUrl || '—';
    createdEl.textContent = `建立於 ${formatDate(link.createdAt || link.created_at)}`;

    const tags = normalizeTags(link);
    if (tags.length) {
      tagsEl.innerHTML = '';
      tags.forEach((tag) => {
        const span = document.createElement('span');
        span.textContent = tag;
        tagsEl.appendChild(span);
      });
      tagsEl.removeAttribute('hidden');
    } else {
      tagsEl.setAttribute('hidden', '');
      tagsEl.innerHTML = '';
    }

    const details = buildDetailsList(link);
    const dl = detailsSection.querySelector('dl');
    details.forEach(([label, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.append(dt, dd);
    });

    linksContainer.appendChild(node);
  });
}

function renderPlaceholder() {
  linksContainer.innerHTML = '';
  const skeleton = document.createElement('p');
  skeleton.className = 'empty-state';
  skeleton.textContent = '載入中…';
  linksContainer.appendChild(skeleton);
}

function renderError(message) {
  linksContainer.innerHTML = '';
  const errorEl = document.createElement('p');
  errorEl.className = 'empty-state';
  errorEl.textContent = message;
  linksContainer.appendChild(errorEl);
}

function setFormDisabled(targetForm, disabled) {
  Array.from(targetForm.elements).forEach((el) => {
    el.disabled = disabled;
  });
}

function showFormMessage(message, isError = false) {
  messageEl.textContent = message;
  messageEl.className = isError ? 'error' : 'success';
}

function showEditMessage(message, isError = false) {
  if (!editMessage) return;
  editMessage.textContent = message;
  editMessage.className = `form-message ${isError ? 'error' : message ? 'success' : ''}`.trim();
}

async function handleLinkContainerClick(event) {
  const action = event.target?.dataset?.action;
  if (!action) return;

  const article = event.target.closest('.link-item');
  if (!article) return;
  const linkId = article.dataset.linkId;

  if (action === 'copy') {
    const href = article.querySelector('[data-copy]')?.dataset?.href;
    if (href) {
      try {
        await navigator.clipboard.writeText(href);
        showTemporaryToast(article, '已複製！');
      } catch (error) {
        console.error(error);
        showDialog('複製失敗', '無法存取剪貼簿，請手動複製。');
      }
    }
    return;
  }

  if (action === 'details') {
    await toggleDetails(article, linkId);
    return;
  }

  if (action === 'edit') {
    await openEditDialog(linkId);
    return;
  }

  if (action === 'delete') {
    if (!confirm('確定要刪除這個短網址嗎？')) return;
    try {
      const response = await fetch(`/api/links/${linkId}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 204) {
        const data = await safeParseJSON(response);
        throw new Error(data?.message || '刪除失敗');
      }
      await fetchLinks();
    } catch (error) {
      console.error(error);
      showDialog('刪除失敗', error.message || '發生未知錯誤');
    }
  }
}

async function toggleDetails(article, linkId) {
  const section = article.querySelector('.link-details');
  if (!section) return;
  if (!section.hasAttribute('hidden')) {
    section.setAttribute('hidden', '');
    return;
  }

  try {
    const response = await fetch(`/api/links/${linkId}`);
    if (!response.ok) {
      const data = await safeParseJSON(response);
      throw new Error(data?.message || '取得短網址詳情失敗');
    }
    const data = await response.json();
    const dl = section.querySelector('dl');
    dl.innerHTML = '';
    const details = buildDetailsList(data);
    details.forEach(([label, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.append(dt, dd);
    });
    section.removeAttribute('hidden');

    const index = currentLinks.findIndex((item) => parseLinkId(item) === linkId);
    if (index >= 0) {
      currentLinks[index] = { ...currentLinks[index], ...data };
    }
  } catch (error) {
    console.error(error);
    showDialog('載入詳情失敗', error.message || '發生未知錯誤');
  }
}

async function openEditDialog(linkId) {
  if (!editDialog || !editForm) return;
  editingLinkId = linkId;
  editForm.reset();
  setFormDisabled(editForm, true);
  showEditMessage('載入資料中…');
  editDialog.removeAttribute('hidden');

  try {
    const response = await fetch(`/api/links/${linkId}`);
    if (!response.ok) {
      const data = await safeParseJSON(response);
      throw new Error(data?.message || '取得短網址資料失敗');
    }
    const data = await response.json();
    populateEditForm(data);
    setFormDisabled(editForm, false);
    showEditMessage('');
  } catch (error) {
    console.error(error);
    showEditMessage(error.message || '無法載入資料', true);
    setFormDisabled(editForm, false);
  }
}

function closeEditDialog() {
  if (!editDialog || !editForm) return;
  editDialog.setAttribute('hidden', '');
  setFormDisabled(editForm, false);
  editForm.reset();
  showEditMessage('');
  editingLinkId = null;
}

function populateEditForm(link) {
  if (!editForm) return;
  const linkId = parseLinkId(link);
  editForm.elements.linkId.value = linkId || '';
  editForm.elements.originalURL.value = link.originalURL || link.originalUrl || '';
  editForm.elements.path.value = link.path || '';
  editForm.elements.title.value = link.title || '';
  editForm.elements.expiresAt.value = toLocalInputValue(link.expiresAt || link.expires_at);
  const allowDup = link.allowDuplicates ?? link.allow_duplicates ?? false;
  editForm.elements.allowDuplicates.checked = Boolean(allowDup);
  const redirectType = link.redirectType ?? link.redirect_type;
  editForm.elements.redirectType.value = redirectType ? String(redirectType) : '';
  const tags = normalizeTags(link);
  editForm.elements.tags.value = tags.join(', ');
  editForm.elements.description.value = link.description || link.note || '';
}

function collectLinkPayload(targetForm, options = {}) {
  const {
    allowEmptyPath,
    allowEmptyTitle,
    allowNullExpires,
    emptyTagsAsArray,
    allowEmptyDescription,
  } = options;

  const payload = {};
  const original = targetForm.elements.originalURL?.value?.trim();
  if (original) payload.originalURL = original;

  const path = targetForm.elements.path?.value ?? '';
  if (path.trim() || allowEmptyPath) {
    payload.path = path.trim();
  }

  const title = targetForm.elements.title?.value ?? '';
  if (title.trim() || allowEmptyTitle) {
    payload.title = title.trim();
  }

  const expiresAt = targetForm.elements.expiresAt?.value;
  if (expiresAt) {
    payload.expiresAt = expiresAt;
  } else if (allowNullExpires) {
    payload.expiresAt = '';
  }

  if (targetForm.elements.allowDuplicates) {
    payload.allowDuplicates = targetForm.elements.allowDuplicates.checked;
  }

  const redirectType = targetForm.elements.redirectType?.value;
  if (redirectType) {
    payload.redirectType = redirectType;
  }

  const rawTags = targetForm.elements.tags?.value ?? '';
  if (rawTags.trim()) {
    payload.tags = rawTags.trim();
  } else if (emptyTagsAsArray) {
    payload.tags = [];
  }

  const description = targetForm.elements.description?.value ?? '';
  if (description.trim() || allowEmptyDescription) {
    payload.description = description.trim();
  }

  return payload;
}

function closeDialog() {
  dialog.setAttribute('hidden', '');
}

function showDialog(title, body) {
  dialogTitle.textContent = title;
  dialogBody.textContent = body;
  dialog.removeAttribute('hidden');
}

function showTemporaryToast(node, message) {
  const toast = document.createElement('span');
  toast.className = 'toast';
  toast.textContent = message;
  node.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 1500);
}

function focusLink(linkId) {
  if (!linkId) return;
  const el = linksContainer.querySelector(`[data-link-id="${linkId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight');
    setTimeout(() => el.classList.remove('highlight'), 2000);
  }
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function safeParseJSON(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

function buildDetailsList(link) {
  if (!link) return [];
  const shortUrl = link.shortURL || link.shortUrl || composeShortUrl(link);
  const tags = normalizeTags(link);
  const redirectType = link.redirectType ?? link.redirect_type;
  const allowDup = link.allowDuplicates ?? link.allow_duplicates;

  return [
    ['短網址', shortUrl || '—'],
    ['原始網址', link.originalURL || link.originalUrl || '—'],
    ['標題', link.title || '—'],
    ['唯一代號', parseLinkId(link) || '—'],
    ['狀態', link.archived ? '已封存' : '使用中'],
    ['建立時間', formatDate(link.createdAt || link.created_at)],
    ['更新時間', formatDate(link.updatedAt || link.updated_at)],
    ['到期時間', formatDate(link.expiresAt || link.expires_at)],
    ['重新導向類型', formatRedirectType(redirectType)],
    ['允許重複建立', formatBoolean(allowDup)],
    ['總點擊數', link.clicks != null ? String(link.clicks) : '—'],
    ['標籤', tags.length ? tags.join(', ') : '—'],
    ['備註', link.description || link.note || '—'],
  ];
}

function composeShortUrl(link) {
  const domain = link.domain || link.domain_id || currentDomain;
  const secureShortUrl = link.secureShortURL || link.secureShortUrl;
  if (secureShortUrl) return secureShortUrl;
  if (!domain || !link.path) return '';
  const protocol = link.secure === false ? 'http://' : 'https://';
  return `${protocol}${domain}/${link.path}`;
}

function formatDate(input) {
  if (!input) return '—';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return typeof input === 'string' ? input : '—';
  return date.toLocaleString();
}

function toLocalInputValue(input) {
  if (!input) return '';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const tzOffset = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - tzOffset);
  return local.toISOString().slice(0, 16);
}

function parseLinkId(link) {
  if (!link) return '';
  return link.idString || link.id || '';
}

function normalizeTags(link) {
  if (!link) return [];
  if (Array.isArray(link.tags)) {
    return link.tags.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (typeof link.tagsString === 'string') {
    return link.tagsString.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  if (typeof link.tags === 'string') {
    return link.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  if (typeof link.tags_list === 'string') {
    return link.tags_list.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  return [];
}

function formatRedirectType(value) {
  if (value == null || value === '') return '預設 (302)';
  const numberValue = Number.parseInt(value, 10);
  const mapping = {
    301: '301 永久導向',
    302: '302 暫時導向',
    307: '307 暫時導向',
  };
  return mapping[numberValue] || String(value);
}

function formatBoolean(value) {
  if (value == null) return '—';
  return value ? '是' : '否';
}

function extractDomainArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.domains)) return data.domains;
  return [];
}

function findMatchingDomain(domains, targetDomain) {
  if (!domains.length) return null;
  if (!targetDomain) return domains[0];
  const normalized = targetDomain.toLowerCase();
  return (
    domains.find((domain) => {
      const name = (domain.hostname || domain.domain || domain.fullName || '').toLowerCase();
      return name === normalized;
    }) || domains[0]
  );
}

function formatDomainLabel(domain, fallback) {
  if (!domain && fallback) {
    return `使用網域：${fallback}`;
  }
  if (!domain) {
    return '已連線至 Short.io';
  }
  const name = domain.hostname || domain.domain || domain.fullName || fallback || '';
  const suffix = domain.active === false ? '（未啟用）' : '';
  return `使用網域：${name}${suffix}`;
}

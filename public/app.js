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

let currentLinks = [];
let isLoading = false;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  if (!payload.originalURL) {
    showFormMessage('請輸入原始網址', true);
    return;
  }

  try {
    setFormDisabled(true);
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
    focusLink(created?.idString || created?.id);
  } catch (error) {
    console.error(error);
    showFormMessage(error.message || '建立短網址時發生未知錯誤', true);
  } finally {
    setFormDisabled(false);
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
  if (event.key === 'Escape' && !dialog.hasAttribute('hidden')) {
    closeDialog();
  }
});

fetchLinks();

async function fetchLinks() {
  if (isLoading) return;
  isLoading = true;
  renderPlaceholder();

  try {
    const params = new URLSearchParams();
    const search = searchInput.value.trim();
    if (search) params.set('search', search);

    const response = await fetch(`/api/links?${params.toString()}`);
    if (!response.ok) {
      const errorData = await safeParseJSON(response);
      throw new Error(errorData?.message || '載入短網址列表失敗');
    }
    const data = await response.json();
    currentLinks = Array.isArray(data?.links) ? data.links : data?.data || [];
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
    const createdEl = node.querySelector('.link-created');
    const detailsSection = node.querySelector('.link-details');

    node.dataset.linkId = link.idString || link.id;
    titleEl.textContent = link.title || '未命名短網址';
    const shortUrl = link.shortURL || link.shortUrl || composeShortUrl(link);
    shortEl.textContent = shortUrl;
    shortEl.dataset.href = shortUrl;
    originalEl.textContent = link.originalURL || link.originalUrl;
    createdEl.textContent = `建立於 ${formatDate(link.createdAt || link.created_at)}`;

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

function setFormDisabled(disabled) {
  Array.from(form.elements).forEach((el) => {
    el.disabled = disabled;
  });
}

function showFormMessage(message, isError = false) {
  messageEl.textContent = message;
  messageEl.className = isError ? 'error' : 'success';
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
      await navigator.clipboard.writeText(href);
      showTemporaryToast(article, '已複製！');
    }
    return;
  }

  if (action === 'details') {
    await toggleDetails(article, linkId);
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
    return;
  }
}

async function toggleDetails(article, linkId) {
  const section = article.querySelector('.link-details');
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
  } catch (error) {
    console.error(error);
    showDialog('載入詳情失敗', error.message || '發生未知錯誤');
  }
}

function buildDetailsList(link) {
  if (!link) return [];
  const shortUrl = link.shortURL || link.shortUrl || composeShortUrl(link);
  return [
    ['短網址', shortUrl || '—'],
    ['原始網址', link.originalURL || link.originalUrl || '—'],
    ['標題', link.title || '—'],
    ['唯一代號', link.idString || link.id || '—'],
    ['建立時間', formatDate(link.createdAt || link.created_at)],
    ['更新時間', formatDate(link.updatedAt || link.updated_at)],
    ['總點擊數', link.clicks != null ? String(link.clicks) : '—'],
    ['狀態', link.archived ? '已封存' : '使用中'],
  ];
}

function composeShortUrl(link) {
  const domain = link.domain || link.domain_id;
  const secureShortUrl = link.secureShortURL || link.secureShortUrl;
  if (secureShortUrl) return secureShortUrl;
  if (!domain || !link.path) return '';
  const protocol = link.secure ? 'https://' : 'http://';
  return `${protocol}${domain}/${link.path}`;
}

function formatDate(input) {
  if (!input) return '—';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleString();
}

function showDialog(title, body) {
  dialogTitle.textContent = title;
  dialogBody.textContent = body;
  dialog.removeAttribute('hidden');
}

function closeDialog() {
  dialog.setAttribute('hidden', '');
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

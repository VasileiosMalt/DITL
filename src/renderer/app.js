// =================================================================
// DITL - Developer-In-The-Loop - Renderer
// =================================================================

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'className') el.className = v;
    else if (k === 'htmlFor') el.htmlFor = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else if (c) el.appendChild(c);
  }
  return el;
};

// -- Design tokens --
const T = {
  bg:        '#0c0c14',
  surface:   '#13132a',
  card:      '#1a1a36',
  cardHover: '#1f1f42',
  border:    'rgba(124,58,237,0.12)',
  borderLit: 'rgba(124,58,237,0.35)',
  accent:    '#7c3aed',
  accentDim: 'rgba(124,58,237,0.15)',
  green:     '#10b981',
  greenDim:  'rgba(16,185,129,0.12)',
  amber:     '#f59e0b',
  amberDim:  'rgba(245,158,11,0.12)',
  red:       '#ef4444',
  redDim:    'rgba(239,68,68,0.12)',
  blue:      '#3b82f6',
  blueDim:   'rgba(59,130,246,0.12)',
  text:      '#e2e8f0',
  textDim:   '#8888a8',
  textMuted: '#55556a',
  mono:      "'JetBrains Mono', 'Fira Code', monospace",
  sans:      "'Inter', -apple-system, sans-serif",
  radius:    '10px',
  radiusLg:  '14px',
  shadow:    '0 4px 24px rgba(0,0,0,0.4)',
};

// -- State --
const state = {
  view: 'home',
  settings: {},
  projectPath: null,
  scanResult: null,
  params: [],
  pendingChanges: {},
  filterCategory: 'All',
  filterRisk: 'All',
  searchQuery: '',
  loading: false,
  loadingMsg: '',
  error: null,
  history: [],
  expandedHistory: {},
};

// -- Render engine --
function render() {
  const app = $('#app');
  // Preserve scroll position across re-renders
  const prevContent = app.querySelector('[data-content]');
  const scrollTop = prevContent ? prevContent.scrollTop : 0;

  app.innerHTML = '';
  app.style.background = T.bg;
  app.style.fontFamily = T.sans;
  app.appendChild(renderNav());
  const content = h('div', { style: {
    flex: '1', overflow: 'auto', padding: '28px 32px',
    animation: state._lastView !== state.view ? 'fadeIn 0.25s ease' : 'none',
  }});
  state._lastView = state.view;
  content.setAttribute('data-content', '1');

  switch (state.view) {
    case 'home':     content.appendChild(renderHome()); break;
    case 'settings': content.appendChild(renderSettings()); break;
    case 'params':   content.appendChild(renderParams()); break;
    case 'history':  content.appendChild(renderHistory()); break;
  }

  if (state.loading) content.appendChild(renderOverlay());
  if (state.error) content.appendChild(renderError());
  app.appendChild(content);

  // Restore scroll position
  if (scrollTop) {
    content.scrollTop = scrollTop;
  }
}

function renderPendingPill() {
  const pending = Object.keys(state.pendingChanges).length;
  if (pending === 0) return null;

  const pill = h('div', { style: {
    marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px',
  }});
  pill.appendChild(h('span', { style: {
    background: T.amberDim, color: T.amber, border: `1px solid rgba(245,158,11,0.3)`,
    borderRadius: '20px', padding: '4px 14px', fontSize: '11px', fontWeight: '600',
    letterSpacing: '0.3px',
  }}, `${pending} unsaved`));
  pill.appendChild(h('button', {
    style: {
      background: T.green, color: '#fff', border: 'none', borderRadius: '8px',
      padding: '5px 14px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
      fontFamily: T.sans,
    },
    onClick: saveAllChanges,
  }, 'Save All'));

  return pill;
}

function refreshPendingUi() {
  const navPending = document.getElementById('nav-pending');
  if (navPending) {
    navPending.innerHTML = '';
    const pill = renderPendingPill();
    if (pill) navPending.appendChild(pill);
  }

  const discardBtnContainer = document.getElementById('discard-btn-container');
  if (discardBtnContainer) {
    discardBtnContainer.innerHTML = '';
    if (Object.keys(state.pendingChanges).length > 0) {
      discardBtnContainer.appendChild(h('button', {
        style: {
          marginLeft: 'auto', background: 'transparent', color: T.textDim, border: `1px solid ${T.border}`,
          borderRadius: '8px', padding: '6px 14px', fontSize: '11.5px', cursor: 'pointer', fontFamily: T.sans,
        },
        onClick: () => { state.pendingChanges = {}; render(); },
      }, 'Discard all'));
    }
  }
}

// -- Navigation --
function renderNav() {
  const items = [
    { id: 'home',    icon: '\u2302', label: 'Home' },
    { id: 'params',  icon: '\u25C8', label: 'Parameters', disabled: !state.params.length },
    { id: 'history', icon: '\u21BB', label: 'History' },
    { id: 'settings',icon: '\u2699', label: 'Settings' },
  ];

  const nav = h('div', { id: 'app-nav', style: {
    display: 'flex', alignItems: 'center', gap: '2px', padding: '6px 24px',
    background: T.surface, borderBottom: `1px solid ${T.border}`,
  }});

  for (const item of items) {
    const active = state.view === item.id;
    const btn = h('button', {
      style: {
        background: active ? T.accentDim : 'transparent',
        color: item.disabled ? T.textMuted : (active ? T.accent : T.textDim),
        border: active ? `1px solid ${T.borderLit}` : '1px solid transparent',
        borderRadius: '8px', padding: '7px 16px',
        cursor: item.disabled ? 'default' : 'pointer',
        fontSize: '12.5px', fontWeight: active ? '600' : '500',
        fontFamily: T.sans, letterSpacing: '0.3px',
        transition: 'all 0.2s ease',
        opacity: item.disabled ? 0.35 : 1,
      },
      onClick: () => { if (!item.disabled) { state.view = item.id; render(); } },
    }, `${item.icon}  ${item.label}`);
    nav.appendChild(btn);
  }

  const pendingSlot = h('div', { id: 'nav-pending', style: { marginLeft: 'auto' } });
  const pill = renderPendingPill();
  if (pill) pendingSlot.appendChild(pill);
  nav.appendChild(pendingSlot);

  return nav;
}

// -- Home View --
function renderHome() {
  const wrap = h('div', { style: { maxWidth: '680px', margin: '0 auto', textAlign: 'center', paddingTop: '50px' }});

  // Logo
  const logo = h('div', { style: { marginBottom: '20px', animation: 'fadeIn 0.4s ease' }});

  logo.appendChild(h('img', { 
    src: '../../Ditl_logo.png',
    style: {
      width: '56px', height: '56px', borderRadius: '16px', margin: '0 auto 16px',
      display: 'block',
      boxShadow: `0 8px 32px rgba(124,58,237,0.35)`,
      objectFit: 'contain'
    }
  }));

  logo.appendChild(h('h1', { style: {
    fontSize: '32px', fontWeight: '700', margin: '0 0 6px',
    background: 'linear-gradient(135deg, #c4b5fd, #7c3aed, #a78bfa)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    letterSpacing: '2px',
  }}, 'DITL'));
  logo.appendChild(h('p', { style: {
    color: T.textDim, fontSize: '13px', fontWeight: '500', letterSpacing: '1.5px', textTransform: 'uppercase',
  }}, 'Developer-In-The-Loop'));
  wrap.appendChild(logo);

  wrap.appendChild(h('p', { style: {
    color: T.textDim, marginBottom: '36px', lineHeight: '1.7', fontSize: '14px', maxWidth: '480px', margin: '0 auto 36px',
  }}, 'AI-powered parameter discovery & tuning. Open a project, let AI find every tunable knob, then adjust and save  all from one UI.'));

  // API key warning
  if (!state.settings.apiKey && state.settings.provider !== 'ollama') {
    wrap.appendChild(h('div', { style: {
      background: T.amberDim, border: `1px solid rgba(245,158,11,0.25)`,
      borderRadius: T.radiusLg, padding: '14px 20px', marginBottom: '28px', textAlign: 'left',
      display: 'flex', alignItems: 'center', gap: '10px',
    }},
      h('span', { style: { fontSize: '16px' } }, '!'),
      h('span', { style: { fontSize: '13px', color: T.amber } }, 'No API key configured. '),
      h('a', {
        href: '#', style: { color: T.accent, textDecoration: 'none', fontWeight: '600', fontSize: '13px' },
        onClick: (e) => { e.preventDefault(); state.view = 'settings'; render(); },
      }, 'Go to Settings \u2192'),
    ));
  }

  // Action buttons
  const actions = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }});

  actions.appendChild(makeButton('Open Project Folder', T.accent, openProject, { padding: '14px 44px', fontSize: '15px' }));

  if (state.projectPath) {
    const pathCard = h('div', { style: {
      background: T.card, borderRadius: T.radius, padding: '14px 20px',
      border: `1px solid ${T.border}`, width: '100%', textAlign: 'left', marginTop: '8px',
    }});
    pathCard.appendChild(h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' }},
      h('span', { style: { fontSize: '14px' } }, '>'),
      h('span', { style: {
        color: T.accent, fontSize: '13px', wordBreak: 'break-all', fontFamily: T.mono, fontWeight: '500',
      }}, state.projectPath),
    ));
    if (state.scanResult) {
      pathCard.appendChild(h('div', { style: {
        display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '12px', color: T.textDim,
      }},
        h('span', { style: { color: T.green } }, '!'),
        h('span', {}, `${state.scanResult.fileCount} files scanned`),
      ));
    }
    actions.appendChild(pathCard);

    if (state.scanResult) {
      actions.appendChild(makeButton('Analyze with AI', T.green, analyzeProject, { padding: '12px 36px', fontSize: '14px', marginTop: '4px' }));
    }
  }

  if (state.params.length > 0) {
    const successCard = h('div', { style: {
      background: T.greenDim, border: `1px solid rgba(16,185,129,0.25)`, borderRadius: T.radiusLg,
      padding: '16px 24px', marginTop: '16px', width: '100%', textAlign: 'left',
      display: 'flex', alignItems: 'center', gap: '12px',
    }});
    successCard.appendChild(h('span', { style: { fontSize: '22px' } }, 'OK'));
    const successText = h('div', {});
    successText.appendChild(h('span', { style: { fontWeight: '600', fontSize: '14px', color: T.green } },
      `${state.params.length} parameters discovered`));
    successText.appendChild(h('a', {
      href: '#', style: { display: 'block', color: T.accent, fontSize: '13px', marginTop: '2px', textDecoration: 'none', fontWeight: '500' },
      onClick: (e) => { e.preventDefault(); state.view = 'params'; render(); },
    }, 'View & tune them \u2192'));
    successCard.appendChild(successText);
    actions.appendChild(successCard);
  }

  wrap.appendChild(actions);
  return wrap;
}

// -- Settings View --
function renderSettings() {
  const wrap = h('div', { style: { maxWidth: '560px', margin: '0 auto', animation: 'fadeIn 0.3s ease' }});

  const header = h('div', { style: { marginBottom: '28px' }});
  header.appendChild(h('h2', { style: { fontSize: '20px', fontWeight: '700', margin: '0 0 4px' } }, 'Settings'));
  header.appendChild(h('p', { style: { color: T.textDim, fontSize: '13px', margin: 0 } }, 'Configure your AI provider and preferences'));
  wrap.appendChild(header);

  const s = state.settings;

  // Sections
  wrap.appendChild(settingsSection('AI Provider', [
    field('Provider', 'select', 'provider', s, {
      options: [
        { value: 'openai', label: 'OpenAI' },
        { value: 'anthropic', label: 'Anthropic' },
        { value: 'openrouter', label: 'OpenRouter' },
        { value: 'ollama', label: 'Ollama (Local)' },
      ]
    }),
    field('API Key', 'password', 'apiKey', s, { placeholder: 'sk-...', hide: s.provider === 'ollama' }),
    field('Model (OpenAI / Anthropic)', 'text', 'model', s, { placeholder: 'gpt-4o-mini', hide: s.provider === 'ollama' || s.provider === 'openrouter' }),
    field('OpenRouter Model', 'text', 'openrouterModel', s, { placeholder: 'anthropic/claude-sonnet-4', hide: s.provider !== 'openrouter' }),
    field('Ollama URL', 'text', 'ollamaUrl', s, { placeholder: 'http://localhost:11434', hide: s.provider !== 'ollama' }),
    field('Ollama Model', 'text', 'ollamaModel', s, { placeholder: 'llama3', hide: s.provider !== 'ollama' }),
  ]));

  wrap.appendChild(settingsSection('Scanning', [
    field('Max File Size (KB)', 'text', 'maxFileSizeKB', s, { placeholder: '200' }),
  ]));

  wrap.appendChild(h('div', { style: { paddingTop: '8px' }},
    makeButton('Save Settings', T.accent, async () => {
      await api.saveSettings(state.settings);
      showToast('Settings saved');
    }),
  ));

  return wrap;
}

function settingsSection(title, fields) {
  const section = h('div', { style: {
    background: T.card, borderRadius: T.radiusLg, padding: '20px',
    border: `1px solid ${T.border}`, marginBottom: '16px',
  }});
  section.appendChild(h('div', { style: {
    fontSize: '12px', fontWeight: '600', color: T.textDim, textTransform: 'uppercase',
    letterSpacing: '1px', marginBottom: '16px',
  }}, title));
  for (const f of fields) section.appendChild(f);
  return section;
}

function field(label, type, key, s, opts = {}) {
  if (opts.hide) return h('div', { style: { display: 'none' } });
  const row = h('div', { style: { marginBottom: '14px' }});
  row.appendChild(h('label', { style: {
    display: 'block', fontSize: '12px', color: T.textDim, marginBottom: '5px', fontWeight: '500',
  }}, label));

  const inputStyle = {
    width: '100%', background: T.bg, border: `1px solid rgba(255,255,255,0.08)`,
    borderRadius: '8px', padding: '10px 14px', color: T.text, fontSize: '13px',
    fontFamily: T.sans, boxSizing: 'border-box', outline: 'none',
    transition: 'border-color 0.2s',
  };

  if (type === 'select') {
    const sel = h('select', { style: inputStyle, onChange: (e) => { state.settings[key] = e.target.value; render(); } });
    for (const o of opts.options || []) {
      const opt = h('option', { value: o.value }, o.label);
      if (s[key] === o.value) opt.selected = true;
      sel.appendChild(opt);
    }
    row.appendChild(sel);
  } else {
    row.appendChild(h('input', {
      type: type === 'password' ? 'password' : 'text',
      value: s[key] || '',
      placeholder: opts.placeholder || '',
      style: inputStyle,
      onInput: (e) => { state.settings[key] = e.target.value; },
      onFocus: function() { this.style.borderColor = T.accent; },
      onBlur: function() { this.style.borderColor = 'rgba(255,255,255,0.08)'; },
    }));
  }
  return row;
}

// -- Parameters View --
function renderParams() {
  const wrap = h('div', { style: { animation: 'fadeIn 0.25s ease' }});

  // Header toolbar
  const toolbar = h('div', { style: {
    display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px', flexWrap: 'wrap',
  }});
  toolbar.appendChild(h('h2', { style: { fontSize: '20px', fontWeight: '700', margin: '0' } },
    '\u2699  Parameters'));
  toolbar.appendChild(h('span', { style: {
    background: T.accentDim, color: T.accent, borderRadius: '20px', padding: '3px 12px',
    fontSize: '12px', fontWeight: '600', border: `1px solid ${T.borderLit}`,
  }}, String(state.params.length)));

  // Search
  toolbar.appendChild(h('div', { style: { marginLeft: '16px', position: 'relative', flex: '1', maxWidth: '260px' }},
    h('input', {
      type: 'text', placeholder: 'Search...',
      value: state.searchQuery,
      style: {
        width: '100%', background: T.card, border: `1px solid ${T.border}`,
        borderRadius: '8px', padding: '7px 12px 7px 30px', color: T.text,
        fontSize: '12.5px', fontFamily: T.sans, boxSizing: 'border-box', outline: 'none',
      },
      onInput: (e) => { 
        state.searchQuery = e.target.value; 
        // Just refresh the list without taking focus away from this input
        refreshParamList(); 
      },
    }),
  ));

  // Filters
  toolbar.appendChild(filterSelect(
    ['All', ...new Set(state.params.map(p => p.category).filter(Boolean))],
    state.filterCategory,
    (v) => { state.filterCategory = v; refreshParamList(); },
  ));
  toolbar.appendChild(filterSelect(
    ['All', 'low', 'medium', 'high'],
    state.filterRisk,
    (v) => { state.filterRisk = v; refreshParamList(); },
    (v) => v === 'All' ? 'All risks' : `${v} risk`,
  ));

  // Ensure only one global listener exists
  if (!window._paramChangedListenerBound) {
    document.addEventListener('paramChanged', () => {
      refreshPendingUi();
    });
    window._paramChangedListenerBound = true;
  }

  // Discard button
  const discardBtnContainer = h('div', { id: 'discard-btn-container', style: { marginLeft: 'auto' }});
  const pending = Object.keys(state.pendingChanges).length;
  if (pending > 0) {
    discardBtnContainer.appendChild(h('button', {
      style: {
        marginLeft: 'auto', background: 'transparent', color: T.textDim, border: `1px solid ${T.border}`,
        borderRadius: '8px', padding: '6px 14px', fontSize: '11.5px', cursor: 'pointer', fontFamily: T.sans,
      },
      onClick: () => { state.pendingChanges = {}; render(); },
    }, 'Discard all'));
  }
  toolbar.appendChild(discardBtnContainer);

  wrap.appendChild(toolbar);

  // Parameter list container (rebuilt on search/filter without full re-render)
  const listContainer = h('div', { id: 'param-list' });
  wrap.appendChild(listContainer);
  buildParamList(listContainer);

  return wrap;
}

function buildParamList(container) {
  container.innerHTML = '';

  // Filter
  let filtered = state.params;
  if (state.filterCategory !== 'All') filtered = filtered.filter(p => p.category === state.filterCategory);
  if (state.filterRisk !== 'All') filtered = filtered.filter(p => p.risk === state.filterRisk);
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.file || '').toLowerCase().includes(q) ||
      (p.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  // Group by category
  const groups = {};
  for (const p of filtered) {
    const cat = p.category || 'Other';
    (groups[cat] = groups[cat] || []).push(p);
  }

  for (const [cat, params] of Object.entries(groups)) {
    const section = h('div', { style: { marginBottom: '28px' }});
    section.appendChild(h('div', { style: {
      display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px',
      paddingBottom: '8px', borderBottom: `1px solid ${T.border}`,
    }},
      h('span', { style: { fontSize: '15px' } }, categoryIcon(cat)),
      h('span', { style: { fontSize: '13px', fontWeight: '600', color: T.text, letterSpacing: '0.3px' } }, cat),
      h('span', { style: { fontSize: '11px', color: T.textMuted } }, `(${params.length})`),
    ));

    const grid = h('div', { style: {
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(370px, 1fr))', gap: '10px',
    }});
    for (const p of params) grid.appendChild(renderParamCard(p));
    section.appendChild(grid);
    container.appendChild(section);
  }

  if (filtered.length === 0) {
    container.appendChild(emptyState('No parameters match the current filters.'));
  }
}

function refreshParamList() {
  const container = document.getElementById('param-list');
  if (container) {
    buildParamList(container);
  } else {
    render();
  }
}

function renderParamCard(p) {
  const hasChange = p.id in state.pendingChanges;
  const currentVal = hasChange ? state.pendingChanges[p.id] : p.currentValue;

  const card = h('div', { style: {
    background: hasChange ? 'rgba(59,130,246,0.06)' : T.card,
    border: `1px solid ${hasChange ? 'rgba(59,130,246,0.25)' : T.border}`,
    borderRadius: T.radius, padding: '14px 16px',
    transition: 'all 0.2s ease, border-color 0.2s ease',
  }});

  // Top row
  const hdr = h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }});
  hdr.appendChild(h('span', { style: {
    fontWeight: '600', fontSize: '13.5px', color: T.text, lineHeight: '1.3',
  }}, p.name || p.id));

  const badges = h('div', { style: { display: 'flex', gap: '4px', flexShrink: '0', marginLeft: '8px' }});
  badges.appendChild(riskBadge(p.risk));
  if (hasChange) badges.appendChild(h('span', { style: {
    fontSize: '9px', background: T.blueDim, color: T.blue, borderRadius: '6px',
    padding: '2px 7px', fontWeight: '600', border: `1px solid rgba(59,130,246,0.2)`,
  }}, 'modified'));
  hdr.appendChild(badges);
  card.appendChild(hdr);

  // Description
  if (p.description) {
    card.appendChild(h('p', { style: {
      fontSize: '11.5px', color: T.textDim, margin: '0 0 8px', lineHeight: '1.5',
    }}, p.description));
  }

  // File reference
  const fileRef = h('div', { style: {
    fontSize: '11px', color: T.textMuted, marginBottom: '10px',
    fontFamily: T.mono, fontWeight: '400', cursor: 'pointer',
    display: 'inline-block'
  }}, `${p.file || '?'}${p.line ? `:${p.line}` : ''}`);
  fileRef.onmouseover = () => fileRef.style.color = '#7c3aed';
  fileRef.onmouseout = () => fileRef.style.color = T.textMuted;
  fileRef.onclick = async () => {
    if (state.projectPath && p.file) {
      const sep = state.projectPath.includes('\\') ? '\\' : '/';
      const normalizedFile = p.file.replace(/^[\/\\]/, '').replace(/[\/\\]/g, sep);
      const absPath = state.projectPath.replace(/[\/\\]$/, '') + sep + normalizedFile;
      await api.openPath(absPath);
    }
  };
  card.appendChild(fileRef);

  // Input
  card.appendChild(renderParamInput(p, currentVal));

  // Reset row
  if (hasChange) {
    const resetRow = h('div', { style: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px',
      padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px',
    }});
    resetRow.appendChild(h('span', { style: {
      fontSize: '11px', color: T.textMuted, fontFamily: T.mono,
    }}, `was: ${truncate(String(p.originalValue ?? p.currentValue), 40)}`));
    resetRow.appendChild(h('button', {
      style: {
        fontSize: '11px', background: 'none', border: 'none', color: T.amber,
        cursor: 'pointer', fontWeight: '500', fontFamily: T.sans,
      },
      onClick: () => { delete state.pendingChanges[p.id]; render(); },
    }, 'reset'));
    card.appendChild(resetRow);
  }

  // Tags
  if (p.tags?.length) {
    const tagRow = h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }});
    for (const t of p.tags.slice(0, 5)) {
      tagRow.appendChild(h('span', { style: {
        fontSize: '10px', background: 'rgba(124,58,237,0.08)', color: T.textDim,
        borderRadius: '5px', padding: '2px 7px', border: `1px solid ${T.border}`,
      }}, t));
    }
    card.appendChild(tagRow);
  }

  return card;
}

function renderParamInput(p, currentVal) {
  // skipRender=true means we record the state change but don't rebuild the entire DOM
  // this prevents losing focus while typing in text inputs or search bars
  const setValue = (v, skipRender) => {
    const orig = String(p.originalValue ?? p.currentValue);
    if (String(v) === orig) delete state.pendingChanges[p.id];
    else state.pendingChanges[p.id] = v;

    // Always dispatch a custom event so the "Discard" button and Reset row can update
    // without rebuilding the list and losing focus.
    if (skipRender) {
      document.dispatchEvent(new CustomEvent('paramChanged'));
    } else {
      render();
    }
  };

  const inputStyle = {
    width: '100%', background: T.bg, border: `1px solid rgba(255,255,255,0.07)`,
    borderRadius: '8px', padding: '8px 11px', color: T.text, fontSize: '13px',
    fontFamily: T.sans, boxSizing: 'border-box', outline: 'none',
    transition: 'border-color 0.2s',
  };

  switch (p.type) {
    case 'number': {
      const wrap = h('div', {});
      const num = parseFloat(currentVal) || 0;
      const min = p.min ?? 0;
      const max = p.max ?? 100;
      const step = p.step ?? (max - min > 10 ? 1 : 0.01);

      const slider = h('input', {
        type: 'range', min: String(min), max: String(max), step: String(step),
        value: String(num),
        style: { width: '100%', accentColor: T.accent, marginBottom: '6px', height: '4px' },
        onInput: (e) => {
          const numInput = wrap.querySelector('input[type="number"]');
          if (numInput) numInput.value = e.target.value;
          setValue(e.target.value, true); 
        },
      });
      wrap.appendChild(slider);

      const row = h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }});
      row.appendChild(h('span', { style: { fontSize: '10px', color: T.textMuted, fontFamily: T.mono } }, String(min)));
      row.appendChild(h('input', {
        type: 'number', value: String(currentVal), min: String(min), max: String(max), step: String(step),
        style: { ...inputStyle, width: '90px', textAlign: 'center', padding: '5px', fontFamily: T.mono, fontWeight: '500' },
        onInput: (e) => {
          slider.value = e.target.value;
          setValue(e.target.value, true);
        },
      }));
      row.appendChild(h('span', { style: { fontSize: '10px', color: T.textMuted, fontFamily: T.mono } }, String(max)));
      wrap.appendChild(row);
      return wrap;
    }
    case 'boolean': {
      const wrap = h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' }});
      let isTrue = String(currentVal).toLowerCase() === 'true';

      const label = h('span', { style: {
        fontSize: '12px', color: isTrue ? T.green : T.textDim, fontWeight: '500',
      }}, isTrue ? 'Enabled' : 'Disabled');

      const thumb = h('div', { style: {
        width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
        position: 'absolute', top: '3px', left: isTrue ? '23px' : '3px',
        transition: 'left 0.25s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }});

      const toggle = h('button', {
        style: {
          width: '44px', height: '24px', borderRadius: '12px', border: 'none',
          background: isTrue ? T.green : 'rgba(255,255,255,0.1)',
          cursor: 'pointer', position: 'relative', transition: 'background 0.25s ease',
          boxShadow: isTrue ? `0 0 12px rgba(16,185,129,0.3)` : 'none',
        },
        onClick: () => {
          isTrue = !isTrue;
          setValue(isTrue ? 'true' : 'false', true);

          toggle.style.background = isTrue ? T.green : 'rgba(255,255,255,0.1)';
          toggle.style.boxShadow = isTrue ? `0 0 12px rgba(16,185,129,0.3)` : 'none';
          thumb.style.left = isTrue ? '23px' : '3px';
          label.style.color = isTrue ? T.green : T.textDim;
          label.textContent = isTrue ? 'Enabled' : 'Disabled';
        },
      });
      toggle.appendChild(thumb);
      wrap.appendChild(toggle);
      wrap.appendChild(label);
      return wrap;
    }
    case 'select': {
      return h('select', {
        style: inputStyle,
        onChange: (e) => setValue(e.target.value, true),
      }, ...(p.options || []).map(opt => {
        const o = h('option', { value: opt }, opt);
        if (String(currentVal) === String(opt)) o.selected = true;
        return o;
      }));
    }
    case 'text': {
      const lines = String(currentVal || '').split('\n').length;
      const ta = h('textarea', {
        rows: String(Math.max(6, Math.min(lines + 2, 20))),
        style: {
          ...inputStyle, resize: 'vertical', fontFamily: T.mono, fontSize: '12px', lineHeight: '1.6',
          minHeight: '120px',
        },
        onInput: (e) => setValue(e.target.value, true), // Pass true to skip re-render
      });
      ta.value = String(currentVal || '');
      return ta;
    }
    default: {
      return h('input', {
        type: 'text', value: String(currentVal || ''),
        style: inputStyle,
        onInput: (e) => setValue(e.target.value, true), // Pass true to skip re-render
      });
    }
  }
}

// -- History View --
function renderHistory() {
  const wrap = h('div', { style: { maxWidth: '900px', margin: '0 auto', animation: 'fadeIn 0.25s ease' }});

  const header = h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }});
  header.appendChild(h('h2', { style: { fontSize: '20px', fontWeight: '700', margin: '0' } }, 'Change History'));
  if (state.history.length > 0) {
    header.appendChild(h('span', { style: {
      background: T.accentDim, color: T.accent, borderRadius: '20px', padding: '3px 12px',
      fontSize: '12px', fontWeight: '600', border: `1px solid ${T.borderLit}`,
    }}, `${state.history.length} changes`));
  }
  wrap.appendChild(header);
  wrap.appendChild(h('p', { style: {
    margin: '0 0 18px', color: T.textDim, fontSize: '12.5px', lineHeight: '1.6',
  }}, 'Click any history entry to inspect the full change.'));

  if (state.history.length === 0) {
    wrap.appendChild(emptyState('No changes recorded yet. Modify parameters and save to see history here.'));
    return wrap;
  }

  // Group by date
  const byDate = {};
  for (const entry of state.history.slice().reverse()) {
    const d = new Date(entry.timestamp).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    (byDate[d] = byDate[d] || []).push(entry);
  }

  for (const [date, entries] of Object.entries(byDate)) {
    wrap.appendChild(h('div', { style: {
      fontSize: '11px', fontWeight: '600', color: T.textMuted, textTransform: 'uppercase',
      letterSpacing: '1px', marginBottom: '10px', marginTop: '8px',
    }}, date));

    const list = h('div', { style: {
      background: T.card, borderRadius: T.radiusLg, border: `1px solid ${T.border}`,
      overflow: 'hidden', marginBottom: '16px',
    }});

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
       const entryKey = entry.id || `${entry.timestamp}-${entry.paramId}-${i}`;
       const expanded = !!state.expandedHistory[entryKey];
       const container = h('div', { style: {
         borderBottom: i < entries.length - 1 ? `1px solid ${T.border}` : 'none',
       }});
       const row = h('div', {
         tabindex: '0',
         style: {
           display: 'grid', gridTemplateColumns: '100px 1fr auto 20px',
           gap: '16px', padding: '12px 18px', alignItems: 'center',
           transition: 'background 0.15s', cursor: 'pointer',
           background: expanded ? 'rgba(124,58,237,0.06)' : 'transparent',
         },
         onClick: () => toggleHistoryEntry(entryKey),
         onKeydown: (e) => {
           if (e.key === 'Enter' || e.key === ' ') {
             e.preventDefault();
             toggleHistoryEntry(entryKey);
           }
         },
       });

      // Time
      row.appendChild(h('span', { style: {
        fontSize: '11px', color: T.textMuted, fontFamily: T.mono,
      }}, new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })));

      // Param name
      row.appendChild(h('span', { style: {
        fontSize: '12.5px', color: T.text, fontWeight: '500',
      }}, entry.paramId));

      // Diff
      const diff = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' }});
      diff.appendChild(h('span', { style: {
        fontSize: '11px', fontFamily: T.mono, color: T.red,
        background: T.redDim, padding: '2px 8px', borderRadius: '5px', maxWidth: '160px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}, truncate(String(entry.oldValue), 25)));
      diff.appendChild(h('span', { style: { color: T.textMuted, fontSize: '12px' } }, '->'));
      diff.appendChild(h('span', { style: {
        fontSize: '11px', fontFamily: T.mono, color: T.green,
        background: T.greenDim, padding: '2px 8px', borderRadius: '5px', maxWidth: '160px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}, truncate(String(entry.newValue), 25)));
      row.appendChild(diff);
       row.appendChild(h('span', { style: {
         color: expanded ? T.accent : T.textMuted, fontSize: '14px', textAlign: 'right', fontWeight: '700',
       }}, expanded ? '−' : '+'));

       container.appendChild(row);

       if (expanded) {
         const details = h('div', { style: {
           padding: '0 18px 18px 134px',
           background: 'rgba(255,255,255,0.015)',
         }});

         const meta = h('div', { style: {
           display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px',
         }});
         if (entry.file) meta.appendChild(h('button', {
           type: 'button',
           style: {
             background: T.blueDim, color: T.blue, border: 'none', borderRadius: '999px',
             padding: '5px 10px', fontSize: '11px', cursor: 'pointer', fontFamily: T.mono,
           },
           onClick: async (e) => {
             e.stopPropagation();
             await openHistoryEntryFile(entry);
           },
         }, `${entry.file}${entry.line ? `:${entry.line}` : ''}`));
         if (entry.category) meta.appendChild(h('span', { style: {
           background: T.accentDim, color: T.accent, borderRadius: '999px', padding: '5px 10px', fontSize: '11px',
         }}, entry.category));
         if (entry.risk) meta.appendChild(riskBadge(entry.risk));
         meta.appendChild(h('span', { style: {
           background: 'rgba(255,255,255,0.04)', color: T.textDim, borderRadius: '999px', padding: '5px 10px', fontSize: '11px',
         }}, new Date(entry.timestamp).toLocaleString()));
         details.appendChild(meta);

         if (entry.description) {
           details.appendChild(h('p', { style: {
             margin: '0 0 12px', color: T.textDim, fontSize: '12px', lineHeight: '1.6',
           }}, entry.description));
         }

         const diffGrid = h('div', { style: {
           display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px',
         }});
         diffGrid.appendChild(renderHistoryValueBlock('Previous value', entry.oldValue, {
           border: 'rgba(239,68,68,0.25)', bg: T.redDim, color: T.red,
         }));
         diffGrid.appendChild(renderHistoryValueBlock('New value', entry.newValue, {
           border: 'rgba(16,185,129,0.25)', bg: T.greenDim, color: T.green,
         }));
         details.appendChild(diffGrid);
       
         container.appendChild(details);
       }

       list.appendChild(container);
    }

    wrap.appendChild(list);
  }

  return wrap;
}

// -- Helpers --
function renderOverlay() {
  const overlay = h('div', { style: {
    position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(4px)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: '1000',
  }});

  const spinner = h('div', { style: { textAlign: 'center' }});
  spinner.appendChild(h('div', { style: {
    width: '36px', height: '36px', border: `2px solid rgba(255,255,255,0.1)`,
    borderTopColor: T.accent, borderRadius: '50%',
    animation: 'spin 0.7s linear infinite', margin: '0 auto 18px',
  }}));
  spinner.appendChild(h('p', { style: {
    color: T.textDim, fontSize: '13px', fontWeight: '500',
  }}, state.loadingMsg || 'Loading...'));
  overlay.appendChild(spinner);
  return overlay;
}

function renderError() {
  const el = h('div', { style: {
    position: 'fixed', bottom: '20px', right: '20px',
    background: T.redDim, border: `1px solid rgba(239,68,68,0.3)`,
    borderRadius: T.radius, padding: '12px 18px', maxWidth: '400px',
    zIndex: '999', fontSize: '12.5px', color: T.red,
    animation: 'slideIn 0.3s ease', backdropFilter: 'blur(8px)',
  }});
  const row = h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '8px' }});
  row.appendChild(h('span', { style: { flexShrink: '0' } }, 'x'));
  row.appendChild(h('span', { style: { flex: '1' } }, state.error));
  row.appendChild(h('button', {
    style: {
      background: 'none', border: 'none', color: T.red, cursor: 'pointer',
      fontSize: '14px', padding: '0 0 0 8px', flexShrink: '0',
    },
    onClick: () => { state.error = null; render(); },
  }, ''));
  el.appendChild(row);
  setTimeout(() => { if (state.error) { state.error = null; render(); } }, 8000);
  return el;
}

function showToast(msg) {
  state.error = null;
  const toast = h('div', { style: {
    position: 'fixed', bottom: '20px', right: '20px',
    background: T.greenDim, border: `1px solid rgba(16,185,129,0.3)`,
    borderRadius: T.radius, padding: '10px 18px',
    color: T.green, fontSize: '12.5px', fontWeight: '500', zIndex: '999',
    animation: 'slideIn 0.3s ease', backdropFilter: 'blur(8px)',
  }}, `${msg}`);
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2500);
}

function makeButton(text, color, onClick, extra = {}) {
  return h('button', {
    style: {
      background: color, color: '#fff', border: 'none', borderRadius: T.radius,
      padding: '10px 28px', fontSize: '13.5px', fontWeight: '600', cursor: 'pointer',
      fontFamily: T.sans, transition: 'all 0.2s ease',
      boxShadow: `0 4px 16px ${color}33`,
      ...extra,
    },
    onClick,
  }, text);
}

function filterSelect(options, current, onChange, labelFn) {
  const sel = h('select', {
    style: {
      background: T.card, border: `1px solid ${T.border}`, borderRadius: '8px',
      padding: '7px 10px', color: T.textDim, fontSize: '12px', fontFamily: T.sans, outline: 'none',
    },
    onChange: (e) => onChange(e.target.value),
  });
  for (const v of options) {
    const o = h('option', { value: v }, labelFn ? labelFn(v) : v);
    if (current === v) o.selected = true;
    sel.appendChild(o);
  }
  return sel;
}

function emptyState(msg) {
  return h('div', { style: {
    textAlign: 'center', padding: '60px 20px',
  }},
    h('div', { style: { fontSize: '32px', marginBottom: '12px', opacity: '0.3' } }, '\u25C7'),
    h('p', { style: { color: T.textMuted, fontSize: '13px' } }, msg),
  );
}

function riskBadge(risk) {
  const map = {
    low:    { bg: T.greenDim, border: 'rgba(16,185,129,0.25)', color: T.green },
    medium: { bg: T.amberDim, border: 'rgba(245,158,11,0.25)', color: T.amber },
    high:   { bg: T.redDim,   border: 'rgba(239,68,68,0.25)',  color: T.red },
  };
  const m = map[risk] || { bg: 'rgba(255,255,255,0.04)', border: T.border, color: T.textMuted };
  return h('span', { style: {
    fontSize: '9.5px', padding: '2px 7px', borderRadius: '6px',
    background: m.bg, border: `1px solid ${m.border}`, color: m.color,
    fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px',
  }}, risk || '-');
}

function categoryIcon(cat) {
  const m = { LLM: '[LLM]', 'ML/AI': '[ML]', Algorithm: '[ALG]', 'UI/UX': '[UI]', Performance: '[PERF]', Network: '[NET]', Database: '[DB]', Config: '[CFG]', Prompt: '[PRM]', Other: '[+]' };
  return m[cat] || '[+]';
}

function truncate(s, n) { return s.length > n ? s.slice(0, n) + '...' : s; }

function toggleHistoryEntry(entryKey) {
  if (state.expandedHistory[entryKey]) delete state.expandedHistory[entryKey];
  else state.expandedHistory[entryKey] = true;
  render();
}

function renderHistoryValueBlock(label, value, tone) {
  const text = value === undefined || value === null || value === '' ? '(empty)' : String(value);
  const block = h('div', { style: {
    border: `1px solid ${tone.border}`,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: T.radius,
    overflow: 'hidden',
  }});
  block.appendChild(h('div', { style: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 12px', background: tone.bg,
  }},
    h('span', { style: { fontSize: '11px', fontWeight: '600', color: tone.color, textTransform: 'uppercase', letterSpacing: '0.5px' } }, label),
    h('span', { style: { fontSize: '10px', color: T.textMuted, fontFamily: T.mono } }, `${String(text).length} chars`),
  ));
  block.appendChild(h('pre', { style: {
    margin: 0, padding: '12px', color: T.text, fontFamily: T.mono, fontSize: '11.5px', lineHeight: '1.6',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '240px', overflow: 'auto',
  }}, text));
  return block;
}

async function openHistoryEntryFile(entry) {
  if (!state.projectPath || !entry.file) return;
  const sep = state.projectPath.includes('\\') ? '\\' : '/';
  const normalizedFile = entry.file.replace(/^[\/\\]/, '').replace(/[\/\\]/g, sep);
  const absPath = state.projectPath.replace(/[\/\\]$/, '') + sep + normalizedFile;
  await api.openPath(absPath);
}

// -- Actions --
async function openProject() {
  try {
    const dir = await api.openProject();
    if (!dir) return;
    state.projectPath = dir;
    state.loading = true;
    state.loadingMsg = 'Scanning project files...';
    render();
    state.scanResult = await api.scanProject(dir);
    state.loading = false;
    render();
  } catch (e) {
    state.loading = false;
    state.error = e.message;
    render();
  }
}

async function analyzeProject() {
  if (!state.settings.apiKey && state.settings.provider !== 'ollama') {
    state.error = 'Configure an API key in Settings first.';
    render();
    return;
  }
  try {
    state.loading = true;
    state.loadingMsg = 'AI is analyzing your codebase for tunable parameters...';
    render();
    state.params = await api.analyzeProject({
      projectPath: state.projectPath,
      files: state.scanResult,
      settings: state.settings,
    });
    state.pendingChanges = {};
    state.loading = false;
    if (state.params.length > 0) state.view = 'params';
    render();
  } catch (e) {
    state.loading = false;
    state.error = e.message;
    render();
  }
}

async function saveAllChanges() {
  const changes = [];
  for (const [id, newValue] of Object.entries(state.pendingChanges)) {
    const param = state.params.find(p => p.id === id);
    if (!param) continue;
    const filePath = param.absolutePath || (state.projectPath + '/' + param.file);
    changes.push({ filePath, param: { ...param, newValue } });
  }
  if (!changes.length) return;

  try {
    state.loading = true;
    state.loadingMsg = `Writing ${changes.length} change${changes.length > 1 ? 's' : ''} to source`;
    render();
    const results = await api.writeParamBatch({ changes });
    let failed = 0;
    const failedDetails = [];
    for (let i = 0; i < results.length; i++) {
      if (results[i].success) {
        const c = changes[i];
        const param = state.params.find(p => p.id === c.param.id);
        state.history.push({
          id: `${Date.now()}-${c.param.id}-${i}`,
          timestamp: Date.now(),
          paramId: c.param.name || c.param.id,
          file: c.param.file,
          line: c.param.line,
          description: c.param.description,
          category: c.param.category,
          risk: c.param.risk,
          oldValue: param.currentValue,
          newValue: c.param.newValue,
        });
        if (param) {
          param.currentValue = c.param.newValue;
          param.originalValue = c.param.newValue;
        }
        delete state.pendingChanges[c.param.id];
      } else {
        failed++;
        const c = changes[i];
        failedDetails.push(`${c.param.name || c.param.id} (${c.param.file}): ${results[i].error || 'write failed'}`);
      }
    }
    state.loading = false;
    if (failed > 0) state.error = `${failed} change(s) failed to write. ${failedDetails.join(' | ')}`;
    else showToast(`${changes.length} change${changes.length > 1 ? 's' : ''} saved`);
    render();
  } catch (e) {
    state.loading = false;
    state.error = e.message;
    render();
  }
}

// -- Init --
(async () => {
  state.settings = await api.loadSettings();
  render();
})();

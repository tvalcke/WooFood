/* script.js — Filtres, recherche en direct, tri et bascule du menu mobile */

// Variables globales
let recipes = [];
let displayedRecipesCount = 15;
const RECIPES_PER_PAGE = 15;
const GLOBAL_RECIPE_IMAGE = 'images/photoavenir.png';

const CATEGORY_LABELS = {
  dejeuner: 'Déjeuner',
  midi: 'Midi',
  soir: 'Soir',
  smoothie: 'Shakers',
  encas: 'En-cas',
  preentrainement: 'Pré-entraînement'
};

const CATEGORY_ALIASES = {
  'petit-dejeuner': 'dejeuner',
  petitdejeuner: 'dejeuner',
  diner: 'soir'
};

function normalizeCategory(value = ''){
  const cleaned = String(value).trim().toLowerCase();
  return CATEGORY_ALIASES[cleaned] || cleaned;
}

function formatCategoryLabel(value = ''){
  const normalized = normalizeCategory(value);
  return CATEGORY_LABELS[normalized] || normalized;
}

// Éléments DOM
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');
const filters = Array.from(document.querySelectorAll('.filter'));
const grid = document.getElementById('grid');
const caloriesMinInput = document.getElementById('caloriesMin');
const caloriesMaxInput = document.getElementById('caloriesMax');
const proteinMinInput = document.getElementById('proteinMin');
const proteinMaxInput = document.getElementById('proteinMax');
const resetRangeFiltersBtn = document.getElementById('resetRangeFilters');
const recipesSearch = document.getElementById('recipesSearch');
const navSearch = document.getElementById('navSearch');
const sortSelect = document.getElementById('sortSelect');
const pageLoader = document.getElementById('pageLoader');

function getNumericInputValue(input){
  if(!input) return null;
  const value = input.value.trim();
  if(value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function passesRange(value, min, max){
  if(min !== null && value < min) return false;
  if(max !== null && value > max) return false;
  return true;
}

function hidePageLoader(){
  if(!pageLoader) return;
  pageLoader.classList.add('is-hidden');
}

function waitForImages(container){
  if(!container) return Promise.resolve();
  const images = Array.from(container.querySelectorAll('img'));
  if(images.length === 0) return Promise.resolve();

  return Promise.all(images.map(image => {
    if(image.complete) return Promise.resolve();
    return new Promise(resolve => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    });
  }));
}

// Extraire les métadonnées depuis une page de recette
async function fetchRecipeMetadata(filePath){
  try {
    const response = await fetch(filePath);
    const html = await response.text();
    
    // Parser la meta tag recipe-data
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const metaTag = doc.querySelector('meta[name="recipe-data"]');
    
    if(!metaTag) return null;
    
    const rawContent = metaTag.getAttribute('content') || '{}';
    const data = JSON.parse(rawContent.replace(/\\'/g, "'"));
    
    // Extraire aussi le titre, l'image et la description depuis la page
    const title = doc.querySelector('article.recipe h1')?.textContent || data.title;
    const meta = doc.querySelector('article.recipe .meta')?.textContent || `${data.calories} kcal • ${data.protein}g protéines`;
    const desc = doc.querySelector('article.recipe .tags span')?.textContent || data.category;
    const imageSrc = doc.querySelector('article.recipe figure img')?.getAttribute('src') || '';
    const image = imageSrc.replace(/^\.\.\//, '');
    const category = normalizeCategory(data.category);
    
    return {
      id: data.id,
      file: filePath,
      title: title,
      shortTitle: title.toLowerCase().replace(/[^a-z0-9]/g, ''),
      calories: data.calories,
      protein: data.protein,
      category: category,
      image: image || GLOBAL_RECIPE_IMAGE,
      desc: `${title} — riche en protéines et facile à préparer.`,
      meta: meta,
      tag: desc
    };
  } catch(err) {
    console.error(`Erreur lors du chargement de ${filePath}:`, err);
    return null;
  }
}

// Scanner le dossier recipes et récupérer les métadonnées
async function discoverRecipeFiles(){
  try {
    const response = await fetch('recipes/');
    const html = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const discovered = Array.from(doc.querySelectorAll('a[href]'))
      .map(link => link.getAttribute('href') || '')
      .filter(href => /^recipe.*\.html$/i.test(href));

    if(discovered.length > 0){
      return discovered.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }));
    }
  } catch(err) {
    console.warn('Impossible de lire le listing du dossier recipes/, bascule sur la détection directe.', err);
  }

  const candidates = [];
  for(let index = 1; index <= 50; index += 1){
    candidates.push(`recipe${index}.html`);
  }

  const existingFiles = [];
  for(const file of candidates){
    try {
      const response = await fetch(`recipes/${file}`, { method: 'GET' });
      if(response.ok){
        existingFiles.push(file);
      }
    } catch(err) {
      // Ignorer les fichiers inexistants ou inaccessibles
    }
  }

  return existingFiles;
}

async function loadRecipes(){
  try {
    const recipeFiles = await discoverRecipeFiles();
    const loadedRecipes = [];
    
    for(const file of recipeFiles){
      const filePath = `recipes/${file}`;
      const metadata = await fetchRecipeMetadata(filePath);
      if(metadata){
        loadedRecipes.push(metadata);
      }
    }
    
    recipes = loadedRecipes;
    renderRecipes();
    initializeFilters();
    await waitForImages(grid);
    hidePageLoader();
  } catch(err) {
    console.error('Erreur lors du chargement des recettes:', err);
    hidePageLoader();
  }
}

// Générer les cartes HTML à partir des données
function renderRecipes(){
  if(!grid) return;
  grid.innerHTML = '';
  
  recipes.slice(0, displayedRecipesCount).forEach((recipe, index) => {
    const article = document.createElement('article');
    article.className = 'card';
    article.dataset.category = recipe.category;
    article.dataset.title = recipe.shortTitle;
    article.dataset.calories = recipe.calories;
    article.dataset.protein = recipe.protein;
    article.dataset.order = index;
    
    article.innerHTML = `
      <a class="card-anchor" href="${recipe.file}">
        <img src="${recipe.image}" alt="${recipe.title}">
        <div class="card-body">
          <h3 class="card-title">${recipe.title}</h3>
          <p class="meta">${recipe.calories} kcal • <span class="protein">${recipe.protein}g</span> protéines</p>
          <p class="desc">${recipe.desc}</p>
          <div class="tags"><span>${formatCategoryLabel(recipe.category)}</span></div>
        </div>
      </a>
    `;
    
    grid.appendChild(article);
  });

  // Ajouter le bouton "Voir plus" si nécessaire
  updateLoadMoreButton();
}

// helper: obtenir la liste actuelle de cartes dans la grille
function getAllCards(){
  return Array.from(grid.querySelectorAll('.card'));
}

// Gérer le bouton "Voir plus"
function updateLoadMoreButton(){
  let loadMoreBtn = document.getElementById('loadMoreBtn');
  let endMessage = document.getElementById('endMessage');
  
  if(displayedRecipesCount < recipes.length){
    if(!loadMoreBtn){
      loadMoreBtn = document.createElement('button');
      loadMoreBtn.id = 'loadMoreBtn';
      loadMoreBtn.className = 'load-more-btn';
      loadMoreBtn.textContent = 'Voir plus';
      loadMoreBtn.addEventListener('click', () => {
        displayedRecipesCount += RECIPES_PER_PAGE;
        renderRecipes();
        initializeFilters();
        applyFilters();
      });
      grid.parentNode.appendChild(loadMoreBtn);
    }
    if(endMessage){
      endMessage.remove();
    }
  } else {
    if(loadMoreBtn){
      loadMoreBtn.remove();
    }
    // Ajouter le message de fin
    if(!endMessage){
      endMessage = document.createElement('div');
      endMessage.id = 'endMessage';
      endMessage.className = 'end-message';
      endMessage.innerHTML = '<p>On est au bout ! Reviens plus tard pour d\'autres recettes.</p>';
      grid.parentNode.appendChild(endMessage);
    }
  }
}

// État du tri courant
let currentSort = { type: 'none', dir: 'desc' };

// État du filtre
let activeFilter = 'tous';

// Bascule du menu mobile
if(hamburger && navLinks){
  hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    hamburger.classList.toggle('open');
  });
}

// Ferme le menu quand on clique sur un lien (mobile)
if(navLinks){
  Array.from(navLinks.querySelectorAll('a')).forEach(a => a.addEventListener('click', () => {
    if(navLinks.classList.contains('open')){
      navLinks.classList.remove('open');
      if(hamburger) hamburger.classList.remove('open');
    }
  }));
}

// Appliquer les filtres et la recherche
function applyFilters(){
  const query = (recipesSearch && recipesSearch.value || '').trim().toLowerCase();
  const caloriesMin = getNumericInputValue(caloriesMinInput);
  const caloriesMax = getNumericInputValue(caloriesMaxInput);
  const proteinMin = getNumericInputValue(proteinMinInput);
  const proteinMax = getNumericInputValue(proteinMaxInput);

  getAllCards().forEach(card => {
    const title = (card.dataset.title || '').toLowerCase();
    const category = normalizeCategory(card.dataset.category || '');
    const activeCategory = normalizeCategory(activeFilter);
    const calories = Number(card.dataset.calories || 0);
    const protein = Number(card.dataset.protein || 0);

    // Category filter
    const catMatch = (activeFilter === 'tous' || activeFilter === 'all') || (category === activeCategory) || card.querySelector('.tags').innerText.toLowerCase().includes(activeCategory);

    // Search filter
    const textMatch = !query || title.includes(query);

    // Range filters
    const caloriesMatch = passesRange(calories, caloriesMin, caloriesMax);
    const proteinMatch = passesRange(protein, proteinMin, proteinMax);

    if(catMatch && textMatch && caloriesMatch && proteinMatch){
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });

  // appliquer le tri courant aux éléments visibles
  if(sortSelect){
    applySort();
  }
}

// Tri : applique le tri courant (utilise data-calories ou data-protein)
function applySort(){
  const value = sortSelect ? sortSelect.value : 'none';
  if(!grid) return;

  const visible = getAllCards().filter(c => c.style.display !== 'none');
  let sorted = visible.slice();

  if(value === 'none'){
    // remettre ordre initial pour visibles
    sorted.sort((a,b) => Number(a.dataset.order) - Number(b.dataset.order));
  } else if(value === 'cal-asc' || value === 'cal-desc'){
    sorted.sort((a,b) => Number(a.dataset.calories || 0) - Number(b.dataset.calories || 0));
    if(value === 'cal-desc') sorted.reverse();
  } else if(value === 'prot-asc' || value === 'prot-desc'){
    sorted.sort((a,b) => Number(a.dataset.protein || 0) - Number(b.dataset.protein || 0));
    if(value === 'prot-desc') sorted.reverse();
  }

  // append in order (only the visible ones)
  sorted.forEach(node => grid.appendChild(node));
}

// Initialisation des event listeners et interaction après chargement des cartes
function initializeFilters(){
  // Clics sur les boutons de filtre
  filters.forEach(btn => {
    btn.addEventListener('click', () => {
      filters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      applyFilters();
    })
  });

  // Recherche en direct (section recettes)
  if(recipesSearch){
    recipesSearch.addEventListener('input', () => applyFilters());
  }

  // La recherche dans la nav synchronise la recherche des recettes
  if(navSearch){
    navSearch.addEventListener('input', (e) => {
      const val = e.target.value;
      if(recipesSearch) recipesSearch.value = val;
      applyFilters();
    });
  }

  // Tri
  if(sortSelect){
    sortSelect.addEventListener('change', () => {
      applySort();
    });
  }

  [caloriesMinInput, caloriesMaxInput, proteinMinInput, proteinMaxInput].forEach(input => {
    if(input){
      input.addEventListener('input', () => applyFilters());
    }
  });

  if(resetRangeFiltersBtn){
    resetRangeFiltersBtn.addEventListener('click', () => {
      if(caloriesMinInput) caloriesMinInput.value = '';
      if(caloriesMaxInput) caloriesMaxInput.value = '';
      if(proteinMinInput) proteinMinInput.value = '';
      if(proteinMaxInput) proteinMaxInput.value = '';
      applyFilters();
    });
  }

  // Accessibilité clavier
  getAllCards().forEach(c => {
    c.tabIndex = 0;
    c.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){
        c.classList.add('active');
        setTimeout(() => c.classList.remove('active'), 600);
      }
    });
  });

  applyFilters();
}

// Charger les recettes au démarrage
if(grid){
  loadRecipes();
}

window.addEventListener('load', () => {
  if(!grid) hidePageLoader();
});

// Bouton scroll to top
const scrollToTopBtn = document.getElementById('scrollToTop');
if(scrollToTopBtn){
  window.addEventListener('scroll', () => {
    if(window.scrollY > 300){
      scrollToTopBtn.classList.add('visible');
    } else {
      scrollToTopBtn.classList.remove('visible');
    }
  });

  scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({top: 0, behavior: 'smooth'});
  });
}

// MODAL - Maître Kung Fu
const heroMascot = document.getElementById('heroMascot');
const masterModal = document.getElementById('masterModal');
const modalClose = document.querySelector('.modal-close');
const modalOverlay = document.querySelector('.modal-overlay');

if(heroMascot && masterModal) {
  heroMascot.style.cursor = 'pointer';
  heroMascot.addEventListener('click', () => {
    masterModal.classList.add('active');
    masterModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  });

  modalClose.addEventListener('click', () => {
    masterModal.classList.remove('active');
    masterModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  });

  modalOverlay.addEventListener('click', () => {
    masterModal.classList.remove('active');
    masterModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  });

  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && masterModal.classList.contains('active')) {
      masterModal.classList.remove('active');
      masterModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  });
}

// FIN de script.js

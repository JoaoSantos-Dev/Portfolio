/**
 * Carrega componentes HTML assincronamente para elementos placeholder.
 * @param {string} elementId - ID do elemento DOM onde o componente será injetado.
 * @param {string} filePath - Caminho do arquivo HTML.
 */
async function loadComponent(elementId, filePath) {
    const element = document.getElementById(elementId);
    if (!element) return;

    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`Erro ao carregar ${filePath}`);
        
        // Insere o HTML
        element.innerHTML = await response.text();

        // NOVO: Se acabou de carregar o header, destaca o link da página atual
        if (elementId === 'header-placeholder') {
            highlightActiveLink();
        }

    } catch (error) {
        console.error('Falha no carregamento do componente:', error);
        element.innerHTML = `<p class="text-red-500 text-xs">Erro ao carregar componente.</p>`;
    }
}

/**
 * Identifica a página atual e destaca o link correspondente no menu de navegação.
 */
function highlightActiveLink() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    
    // IMPORTANTE: Busca pela classe .nav-link que adicionamos acima
    const links = document.querySelectorAll('.nav-link'); 

    links.forEach(link => {
        const href = link.getAttribute('href');
        
        if (href === currentPath) {
            // Adiciona estilo de Ativo (Sublinhado e cor Cyan)
            link.classList.add('text-cyan-400', 'border-b-2', 'border-cyan-500'); 
            link.classList.remove('text-slate-300'); // Remove a cor padrão cinza
        } else {
            // Remove estilo de Ativo
            link.classList.remove('text-cyan-400', 'border-b-2', 'border-cyan-500');
            link.classList.add('text-slate-300'); // Devolve a cor padrão
        }
    });
}

// Inicialização Global
document.addEventListener('DOMContentLoaded', () => {
    // Carrega o Header e o Footer
    loadComponent('header-placeholder', 'components/header.html');
    loadComponent('footer-placeholder', 'components/footer.html');
});

document.addEventListener('DOMContentLoaded', () => {
    // Seleciona todos os itens da timeline
    const timelineItems = document.querySelectorAll('.timeline-item');

    // Configuração do Observer
    const observerOptions = {
        threshold: 0.2, // Dispara quando 20% do item estiver visível
        rootMargin: "0px 0px -50px 0px" // Um pequeno offset para não disparar muito cedo
    };

    const timelineObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Remove as classes de estado "invisível"
                entry.target.classList.remove('opacity-0', 'translate-y-8');
                // Adiciona classes de estado "visível" (se necessário, ou deixa o padrão do elemento)
                // Como removemos o opacity-0, ele voltará para opacity-100 (padrão)
                
                // Parar de observar este item após a animação acontecer
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Ativa o observer para cada item
    timelineItems.forEach(item => {
        timelineObserver.observe(item);
    });
});
document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('recursos-grid');
    const filterBtns = document.querySelectorAll('.filter-btn'); // Seleciona os botões
    let todosRecursos = [];

    // 1. Carregar JSON
    fetch('assets/json/recursos.json')
        .then(response => response.json())
        .then(data => {
            todosRecursos = data;
            renderizarCards(todosRecursos); // Renderiza tudo inicialmente
        })
        .catch(error => console.error('Erro:', error));

    // 2. Renderizar Cards
    function renderizarCards(lista) {
        grid.innerHTML = '';
        
        if(lista.length === 0) {
            grid.innerHTML = '<p class="text-slate-500 text-center col-span-3 py-10">Nenhum recurso encontrado nesta categoria.</p>';
            return;
        }

        lista.forEach(recurso => {
            const card = document.createElement('div');
            card.className = 'group bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10 flex flex-col animate-fade-in-up';
            
            // LÓGICA DA DATA: Cria o HTML apenas se a data existir
            const dataHtml = recurso.dataPostagem 
                ? `<span class="block text-xs text-slate-500 font-mono mb-1 flex items-center gap-1">
                     <svg class="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                     ${recurso.dataPostagem}
                   </span>` 
                : '';

            card.innerHTML = `
                <div class="relative overflow-hidden aspect-video">
                    <img src="${recurso.imagem}" alt="${recurso.titulo}" class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500">
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-60"></div>
                    <span class="absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded bg-slate-950/80 text-cyan-400 border border-slate-800 backdrop-blur-sm">
                        ${recurso.categoria}
                    </span>
                </div>
                
                <div class="p-6 flex flex-col flex-grow">
                    ${dataHtml}
                    
                    <h3 class="text-xl font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">${recurso.titulo}</h3>
                    <p class="text-slate-400 text-sm mb-4 line-clamp-3 flex-grow">${recurso.descricao}</p>
                    
                    <button onclick="abrirPeloId(${recurso.id})" class="mt-auto w-full py-2 px-4 bg-slate-800 hover:bg-cyan-600 hover:text-white text-cyan-400 rounded-lg transition-all duration-300 font-medium text-sm border border-slate-700 hover:border-cyan-500">
                        Ver Detalhes
                    </button>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    // 3. Lógica dos Filtros (NOVO)
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove classe ativa de todos e adiciona no clicado
            filterBtns.forEach(b => {
                b.classList.remove('bg-violet-600', 'text-white', 'border-violet-500', 'shadow-lg');
                b.classList.add('bg-slate-800', 'text-slate-300', 'border-slate-700');
            });
            btn.classList.remove('bg-slate-800', 'text-slate-300', 'border-slate-700');
            btn.classList.add('bg-violet-600', 'text-white', 'border-violet-500', 'shadow-lg');

            // Filtra os dados
            const categoria = btn.getAttribute('data-filter');
            
            if (categoria === 'all') {
                renderizarCards(todosRecursos);
            } else {
                const filtrados = todosRecursos.filter(item => item.categoria === categoria);
                renderizarCards(filtrados);
            }
        });
    });

    // 4. Modal (Código Mantido igual)
    const modal = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalImage = document.getElementById('modal-image');
    const modalBody = document.getElementById('modal-body');
    const modalLinks = document.getElementById('modal-links');
    const closeBtn = document.getElementById('modal-close-btn');
    const backdrop = document.getElementById('modal-backdrop');

    window.abrirPeloId = function(id) {
        const recurso = todosRecursos.find(item => item.id === id);
        if (recurso) abrirModalDetalhes(recurso);
    }

    function abrirModalDetalhes(dados) {
        modalTitle.textContent = dados.titulo;
        modalImage.src = dados.midiaDestaque ? dados.midiaDestaque : dados.imagem;
        modalBody.innerHTML = dados.conteudoDetalhado;
        
        modalLinks.innerHTML = '';
        if (dados.linksExtras) {
            dados.linksExtras.forEach(link => {
                const a = document.createElement('a');
                a.href = link.url;
                a.textContent = link.label;
                a.className = 'px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors';
                a.target = '_blank';
                modalLinks.appendChild(a);
            });
        }
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function fecharModal() {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        setTimeout(() => { modalImage.src = ''; }, 200);
    }

    if (closeBtn) closeBtn.addEventListener('click', fecharModal);
    if (backdrop) backdrop.addEventListener('click', fecharModal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharModal(); });
});
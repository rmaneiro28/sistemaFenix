// Variables globales para resultados
let resultsData = [];
let winningNumbers = [];
let currentGameType = 'polla'; // 'polla' o 'micro'

// Último premio por ganador calculado (fuente única para KPI y tabla)
let lastComputedPrizePerWinner = 0;

// Inicialización cuando se carga la página
document.addEventListener('DOMContentLoaded', async function () {
    // Inicializar Supabase
    if (typeof initializeSupabase === 'function') {
        if (!initializeSupabase()) {
            console.error("Fallo al inicializar Supabase. La página de resultados no funcionará correctamente.");
            document.body.innerHTML = '<div style="color: red; text-align: center; padding: 50px; font-size: 1.2rem;">Error al conectar con la base de datos. Por favor, vuelve a la página principal e inténtalo de nuevo.</div>';
            return;
        }
    } else {
        console.error("La función initializeSupabase no está definida. Asegúrate de que los scripts se cargan en el orden correcto.");
        return;
    }

    // Check URL parameters to set initial game type
    const urlParams = new URLSearchParams(window.location.search);
    const gameParam = urlParams.get('game');
    if (gameParam && (gameParam === 'polla' || gameParam === 'micro')) {
        currentGameType = gameParam;
    }

    setupTabs();
    await loadAndDisplayData();

    // Debounced search: esperar a que el usuario deje de escribir antes de filtrar
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let searchDebounceTimer = null;
        const DEBOUNCE_MS = 350; // ajustar si se desea más/menos latencia

        const debouncedHandler = () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                // No need to reload data, just re-display con el filtro actual
                displayResults();
            }, DEBOUNCE_MS);
        };

        // Usar input para capturar cambios y aplicar debounce
        searchInput.addEventListener('input', debouncedHandler);

        // También manejar paste events (pegado rápido)
        searchInput.addEventListener('paste', () => {
            // Ejecutar el handler después de que el paste actualice el input
            setTimeout(debouncedHandler, 0);
        });
    }

    // Add copy functionality for Pago Móvil
    const copyButton = document.getElementById('copyPagoMovil');
    if (copyButton) {
        copyButton.addEventListener('click', () => {
            const telefono = document.getElementById('pagoMovilTelefono').innerText;
            const cedula = document.getElementById('pagoMovilCedula').innerText;
            const banco = document.getElementById('pagoMovilBanco').innerText;
            const bancoNombre = 'BANESCO'; // Hardcoded as it was before

            const textToCopy = `Pago Móvil\nTeléfono: ${telefono}\nCédula: ${cedula}\nBanco: ${banco} - ${bancoNombre}`;

            navigator.clipboard.writeText(textToCopy).then(() => {
                // Optional: Show a success message
                const originalText = copyButton.innerText;
                copyButton.innerText = '¡Copiado!';
                setTimeout(() => {
                    copyButton.innerText = originalText;
                }, 2000);
            }).catch(err => {
                console.error('Error al copiar datos: ', err);
                alert('Error al copiar los datos.');
            });
        });
    }
});

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');

    const setActiveTab = (gameType) => {
        tabs.forEach(t => {
            if (t.dataset.game === gameType) {
                t.classList.add('bg-white', 'text-fenix-red');
                t.classList.remove('text-white');
            } else {
                t.classList.remove('bg-white', 'text-fenix-red');
                t.classList.add('text-[#a61c00]');
            }
        });
    };

    // Set initial active tab
    setActiveTab(currentGameType);

    tabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            const newGameType = tab.dataset.game;
            if (newGameType === currentGameType) return;

            currentGameType = newGameType;
            setActiveTab(currentGameType);

            // Update URL with game parameter
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('game', currentGameType);
            window.history.pushState({}, '', newUrl);

            // Update page title
            document.title = `Resultados ${currentGameType === 'polla' ? 'Polla' : 'Micro'} - El Fénix`;

            await loadAndDisplayData();
        });
    });
}

async function loadAndDisplayData() {
    await loadDataFromSupabase();
    displayResults();
    generatePreviewImage(); // Generar imagen preliminar después de cargar datos
}

async function loadDataFromSupabase() {
    // Limpiar datos anteriores para evitar "fugas" de una pestaña a otra
    resultsData = [];
    winningNumbers = [];
    let poteSemanal = 0;
    let acumulado = 0;
    let garantizado = 0;

    try {
        // Cargar potes para el juego actual
        const potesResult = await PotesDB.obtener(currentGameType);
        if (potesResult.success && potesResult.data) {
            const potData = potesResult.data;
            acumulado = potData.acumulado || 0;
            garantizado = potData.garantizado || 0;

            // Forzar que el pote del día actual sea 143 siempre
            const weekdayMap = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
            const todayName = weekdayMap[new Date().getDay()];

            const lunes = (todayName === 'lunes') ? 143 : (potData.lunes || 0);
            const martes = (todayName === 'martes') ? 143 : (potData.martes || 0);
            const miercoles = (todayName === 'miércoles') ? 143 : (potData.miércoles || 0);
            const jueves = (todayName === 'jueves') ? 143 : (potData.jueves || 0);
            const viernes = (todayName === 'viernes') ? 143 : (potData.viernes || 0);
            const sabado = (todayName === 'sábado') ? 143 : (potData.sábado || 0);
            const domingo = (todayName === 'domingo') ? 143 : (potData.domingo || 0);

            poteSemanal = lunes + martes + miercoles + jueves + viernes + sabado + domingo;
        } else {
            // Si no hay datos en BD, aun así el día actual debe aportar 143
            const weekdayMap = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
            const todayName = weekdayMap[new Date().getDay()];
        }

        // Cargar números ganadores según el tipo de juego
        let winningNumbersResult;
        if (currentGameType === 'polla') {
            winningNumbersResult = await ResultadosNumerosDB.obtenerUltimo();
        } else {
            winningNumbersResult = await ResultadosMicroDB.obtenerUltimo();
        }

        if (winningNumbersResult.success && winningNumbersResult.data && Array.isArray(winningNumbersResult.data.numeros_ganadores)) {
            winningNumbers = winningNumbersResult.data.numeros_ganadores.map(String); // Asegurar que sean strings para comparación
        } else {
            winningNumbers = [];
        }

        // Cargar datos de tickets/jugadores
        let ticketsResult;
        if (currentGameType === 'polla') {
            ticketsResult = await JugadasPollaDB.obtenerTodas();
        } else {
            ticketsResult = await JugadasMicroDB.obtenerTodas();
        }

        if (ticketsResult.success && Array.isArray(ticketsResult.data)) {
            const tickets = ticketsResult.data;

            let seqCounter = 1;
            resultsData = tickets
                .map(ticket => {
                    const playerName = ticket.nombre_jugador || 'Jugador Desconocido';

                    let playerNumbers;
                    if (currentGameType === 'polla') {
                        playerNumbers = [
                            ticket.nro_1, ticket.nro_2, ticket.nro_3,
                            ticket.nro_4, ticket.nro_5, ticket.nro_6,
                        ].filter(n => n !== null && n !== undefined).map(String);
                    } else { // micro
                        playerNumbers = [
                            ticket.nro_1, ticket.nro_2, ticket.nro_3,
                        ].filter(n => n !== null && n !== undefined).map(String);
                    }

                    // Calcular aciertos
                    let hits = 0;
                    playerNumbers.forEach(number => { if (winningNumbers.includes(number)) hits++; });

                    const player = {
                        id: ticket.id,
                        seq_id: seqCounter++,
                        name: playerName,
                        numbers: playerNumbers,
                        hits: hits,
                        gratis: ticket.gratis,
                        prize: 0 // Se calculará después
                    };

                    return player;
                });

            // Filtrar jugadas duplicadas por ID para evitar que un error en la consulta las repita
            if (resultsData.length > 0 && resultsData[0].id) {
                resultsData = [...new Map(resultsData.map(item => [item.id, item])).values()];
            }

            // Encontrar el número máximo de aciertos
            const maxHits = currentGameType === 'polla' ? 6 : 3;

            // Calcular premios
            const precioJugada = 50;
            const gratisCount = resultsData.filter(p => p.gratis === true).length;
            const payingPlayersCount = resultsData.length - gratisCount;
            const premioTotal = payingPlayersCount * precioJugada;
            const recaudadoParaPremio = premioTotal * 0.8;

            // Calcular el pozo total para el premio mayor
            // Restar el pote semanal del pozo total (según especificación)
            let pozoTotal = recaudadoParaPremio + poteSemanal + garantizado + acumulado;
            // Asegurar que no sea negativo
            if (pozoTotal < 0) pozoTotal = 0;

            // Incluir todos los ganadores (independientemente de 'gratis') al dividir el premio total
            const winnersWithMaxHits = resultsData.filter(player => player.hits === maxHits);

            let prizeForMaxHits = 0;
            if (winnersWithMaxHits.length > 0) {
                prizeForMaxHits = Math.floor(pozoTotal / winnersWithMaxHits.length);
                // Aplicar premio garantizado si es necesario
                if (prizeForMaxHits < garantizado) {
                    prizeForMaxHits = garantizado;
                }
            }

            // Asignar premios a cada jugador (solo premio mayor)
            resultsData.forEach(player => {
                if (player.hits === maxHits) {
                    player.prize = prizeForMaxHits;
                } else {
                    player.prize = 0; // Otros premios se pueden calcular aquí si es necesario
                }
            });

            // Actualizar el valor global del premio por ganador para sincronizar KPI/tabla
            lastComputedPrizePerWinner = Math.max(0, Math.floor(prizeForMaxHits || 0));

            // Ordenar por aciertos (descendente) y luego por seq_id si no hay aciertos, o por nombre
            resultsData.sort((a, b) => {
                if (a.hits !== b.hits) {
                    return b.hits - a.hits;
                } else {
                    if (a.hits === 0) {
                        return a.seq_id - b.seq_id; // Ordenar por # cuando no hay aciertos
                    } else {
                        return a.name.localeCompare(b.name);
                    }
                }
            });

            // Añadir la posición después de ordenar
            resultsData.forEach((player, index) => {
                player.position = index + 1;
            });
        }
        // Si ticketsResult.success es falso, resultsData ya está como []
    } catch (error) {
        console.error("Error cargando datos desde Supabase:", error);
        resultsData = [];
        winningNumbers = [];
    }
}

// Calcular premio según aciertos
function calculatePrize(hits, isGratis, maxHits, prizeForMaxHits, gameType) {
    if (isGratis) return 0;

    // El premio ya se calcula y asigna en loadDataFromSupabase
    // Esta función puede ser simplificada o eliminada si no se usa en otro lugar.
    const isCompleteWinner = (gameType === 'polla' && hits === 6) ||
        (gameType === 'micro' && hits === 3);

    if (isCompleteWinner && prizeForMaxHits > 0) {
        return prizeForMaxHits;
    }

    return 0;
}

// Mostrar números ganadores
function displayWinningNumbers() {
    const container = document.getElementById('winningNumbersGrid');
    container.innerHTML = '';

    if (winningNumbers.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 col-span-full">No se han seleccionado números ganadores</p>';
        return;
    }

    winningNumbers.forEach(number => {
        const numberElement = document.createElement('div');
        // Usar caja cuadrada fija para consistencia (misma anchura/altura para 1 o 2 dígitos)
        numberElement.className = 'w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-md font-bold bg-yellow-400 text-black text-base shadow-md';
        numberElement.style.minWidth = '0';
        numberElement.textContent = number;
        container.appendChild(numberElement);
    });
}

// Mostrar estadísticas resumen
async function displaySummaryStats() {
    const maxPossibleHits = currentGameType === 'polla' ? 6 : 3;

    // Cargar datos del pote
    let poteSemanal = 0;
    let precioJugada = 50;
    let garantizado = 0;
    let acumulado = 0;
    const potesResult = await PotesDB.obtener(currentGameType);
    console.log("potesResult", potesResult.data);
    if (potesResult.success && potesResult.data) {
        const potData = potesResult.data;
        precioJugada = potData.precioJugada || 50;
        garantizado = potData.garantizado || 0;
        acumulado = potData.acumulado || 0;
        poteSemanal = potData.poteSemanal || 0;
    }

    const fullHitWinners = resultsData.filter(player => player.hits === maxPossibleHits);

    const payingPlayersCount = resultsData.filter(player => !player.gratis).length;
    const totalCollected = payingPlayersCount * precioJugada;
    const recaudadoParaPremio = totalCollected * 0.8;
    // Restar el pote semanal del premio total según la nueva regla
    let prizePool = recaudadoParaPremio + poteSemanal + garantizado + acumulado;
    if (prizePool < 0) prizePool = 0;

    // Calcular premio por ganador: dividir el premio total entre la cantidad de GANADORES
    // (usar todos los ganadores, independientemente de si son "gratis" o no)
    let prizePerWinner = 0;
    const winnersCount = fullHitWinners.length;
    if (winnersCount > 0) {
        prizePerWinner = Math.floor(prizePool / winnersCount);
        // Aplicar garantizado si aplica
        if (prizePerWinner < garantizado) prizePerWinner = garantizado;
    }

    // Guardar el valor en la variable global para que KPI, tabla y exporten el mismo número
    lastComputedPrizePerWinner = Math.max(0, Math.floor(prizePerWinner));

    // Actualizar el valor de la jugada en la UI de resultados
    const precioJugadaResultValueEl = document.getElementById('precioJugadaResultValue');
    if (precioJugadaResultValueEl) {
        precioJugadaResultValueEl.textContent = precioJugada;
    }

    // Actualizar título principal
    document.querySelector('.results-title').textContent = currentGameType === 'polla' ? '🐦‍🔥 RESULTADOS POLLA EL FÉNIX 🐦‍🔥' : '🐦‍🔥 RESULTADOS MICRO FÉNIX 🐦‍🔥';

    document.getElementById('totalPlayersResult').textContent = resultsData.length;

    // Actualizar dinámicamente el label de ganadores (siempre todos los aciertos posibles)
    const winnerLabel = document.getElementById('winnerLabel');
    if (winnerLabel) {
        winnerLabel.textContent = `Ganadores (${maxPossibleHits} aciertos)`;
    }
    document.getElementById('totalWinnersResult').textContent = fullHitWinners.length;
    document.getElementById('totalPrizeResult').textContent = `${prizePool.toFixed(0)} BS`;
    // Mostrar en KPI el mismo valor que se dividirá entre ganadores
    document.getElementById('prizePerWinnerResult').textContent = lastComputedPrizePerWinner > 0 ? `${lastComputedPrizePerWinner} BS` : '0 BS';

    // Actualizar label de Premio/Acumulado según exista acumulado
    try {
        const premioAcumEl = document.getElementById('premioAcum');
        if (premioAcumEl) {
            if (acumulado && Number(acumulado) > 0) {
                premioAcumEl.textContent = 'Premio + Acumulado';
            } else {
                premioAcumEl.textContent = 'Premio Total';
            }
        }
    } catch (err) {
        // No interrumpir si algo falla al actualizar el label
        console.warn('No se pudo actualizar el label de premio/acumulado:', err);
    }
}

// Mostrar tabla de resultados
async function displayResultsTable(dataToDisplay) {
    const tableBody = document.getElementById('resultsTableBody');
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    const resultsCounter = document.getElementById('resultsCounter');

    tableBody.innerHTML = '';

    if (resultsCounter) {
        if (searchTerm) {
            resultsCounter.textContent = `Mostrando ${dataToDisplay.length} de ${resultsData.length} jugadas.`;
        } else {
            resultsCounter.textContent = `Mostrando ${resultsData.length} jugadas.`;
        }
    }

    if (dataToDisplay.length === 0) {
        const row = document.createElement('tr');
        if (searchTerm) {
            row.innerHTML = '<td colspan="6" class="text-center py-10 text-gray-500">No se encontraron resultados para \'' + searchTerm + '\'.</td>';
        } else {
            row.innerHTML = '<td colspan="6" class="text-center py-10 text-gray-500">No hay datos de jugadores disponibles</td>';
        }
        tableBody.appendChild(row);
        return;
    }

    // Cargar datos del pote para obtener el valor diario
    let potData = null;
    try {
        const potesResult = await PotesDB.obtener(currentGameType);
        if (potesResult.success && potesResult.data) {
            potData = potesResult.data;
        }
    } catch (error) {
        console.error("Error cargando datos del pote:", error);
    }

    // Usar el premio por ganador ya calculado en displaySummaryStats() para garantizar
    // que KPI y tabla muestren exactamente el mismo valor
    const maxPossibleHits = currentGameType === 'polla' ? 6 : 3;
    const prizePerWinnerLocal = Math.max(0, Math.floor(lastComputedPrizePerWinner || 0));

    const highlight = (text, term) => {
        if (!term) return text;
        const regex = new RegExp(`(${term})`, 'gi');
        return text.replace(regex, '<span class="bg-yellow-300">$1</span>');
    };

    dataToDisplay.forEach((player) => {
        const row = document.createElement('tr');
        row.className = 'bg-white border-b hover:bg-gray-50';
        row.title = player.name;

        let bgColorClass = '';
        const maxPossibleHits = currentGameType === 'polla' ? 6 : 3;

        if (player.hits === maxPossibleHits && player.hits > 0) {
            bgColorClass = 'bg-[#02FF00]'; // Ganador principal
        } else if (currentGameType === 'polla') { // Colores intermedios solo para polla
            switch (player.hits) {
                case 5: bgColorClass = 'bg-[#1275fb]'; break;
                case 4: bgColorClass = 'bg-[#0077b6]'; break;
                case 3: bgColorClass = 'bg-[#03b3d8]'; break;
                case 2: bgColorClass = 'bg-[#4acae5]'; break;
                case 1: bgColorClass = 'bg-[#91e0f0]'; break;
            }
        } else if (currentGameType === 'micro') {
            switch (player.hits) {
                case 2: bgColorClass = 'bg-[#03b3d8]'; break;
                case 1: bgColorClass = 'bg-[#91e0f0]'; break;
                default: break;
            }
        }

        if (bgColorClass) {
            row.classList.add(bgColorClass);
        }

        const positionCell = document.createElement('td');
        positionCell.className = 'px-2 py-2 font-bold text-center text-gray-900';
        positionCell.textContent = player.seq_id;
        if (player.hits === maxPossibleHits && player.hits > 0) {
            positionCell.innerHTML = `🏆 ${player.seq_id}`;
        }

        const nameCell = document.createElement('td');
        nameCell.className = 'px-2 py-2 font-medium text-gray-900 truncate max-w-[220px] overflow-hidden bg-red text-clip max-sm:max-w-[20px] max-sm:text-[10px]';
        nameCell.innerHTML = highlight(player.name, searchTerm);
        nameCell.title = player.name;

        const numbersCell = document.createElement('td');
        numbersCell.className = 'px-2 py-2 text-center';
        numbersCell.innerHTML = `<div class="flex items-center justify-center gap-1 flex-nowrap">${player.numbers.map(number => {
            const isHit = winningNumbers.includes(number);
            const highlightedNumber = highlight(number, searchTerm);
            if (isHit) {
                return `<span class="inline-flex items-center justify-center font-bold text-xs text-center rounded-md w-6 h-6 sm:w-7 sm:h-7" style="background-color: #06402b; color: #ffffff;">${highlightedNumber}</span>`;
            }
            const numberClass = 'bg-gray-200 text-gray-800';
            return `<span class="inline-flex items-center justify-center font-bold text-xs ${numberClass} text-center rounded-md w-6 h-6 sm:w-7 sm:h-7">${highlightedNumber}</span>`;
        }).join('')
            }</div>`;

        const hitsCell = document.createElement('td');
        hitsCell.className = 'px-2 sm:px-6 py-4 text-center';
        hitsCell.innerHTML = `<span class="bg-pink-600 text-white text-sm font-bold px-3 py-1 rounded-full">${player.hits}</span>`;

        const prizeCell = document.createElement('td');
        prizeCell.className = 'px-2 sm:px-6 py-4 text-center font-bold';
        // Mostrar en la tabla el premio por ganador calculado igual que en los KPIs
        if (player.hits === maxPossibleHits && prizePerWinnerLocal > 0) {
            // Mostrar el mismo valor por ganador que el KPI (división del premio total entre ganadores)
            prizeCell.textContent = `${prizePerWinnerLocal} BS`;
            prizeCell.className += ' text-black';
        } else if (player.prize > 0) {
            // Fallback: si player.prize existe (otros niveles), mostrarlo sumando pote diario como antes
            const poteDiario = potData ? potData.poteDiario : 0;
            const totalPrize = player.prize + poteDiario;
            prizeCell.textContent = `${Math.max(0, totalPrize)} BS`;
            prizeCell.className += ' text-black';
        } else {
            prizeCell.textContent = '-';
            prizeCell.className += ' text-gray-500';
        }

        row.appendChild(positionCell);
        row.appendChild(nameCell);
        row.appendChild(numbersCell);
        row.appendChild(hitsCell);
        row.appendChild(prizeCell);

        tableBody.appendChild(row);
    });
}

// Función principal para mostrar todos los resultados
async function displayResults() {
    displayWinningNumbers();
    await displaySummaryStats();

    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let filteredData = resultsData;
    if (searchTerm) {
        filteredData = resultsData.filter(player => {
            const nameMatch = player.name.toLowerCase().includes(searchTerm);
            const numberMatch = player.numbers.some(num => num.includes(searchTerm));
            return nameMatch || numberMatch;
        });

        // Sort filtered data to prioritize names starting with the search term
        filteredData.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            const aStartsWith = aName.startsWith(searchTerm);
            const bStartsWith = bName.startsWith(searchTerm);

            if (a.hits !== b.hits) {
                return b.hits - a.hits; // Higher hits first
            }

            if (aStartsWith && !bStartsWith) {
                return -1; // a comes first
            }
            if (!aStartsWith && bStartsWith) {
                return 1; // b comes first
            }

            // For those that start with the term or don't, sort alphabetically
            return aName.localeCompare(bName);
        });
    }

    displayResultsTable(filteredData);
}



// Imprimir resultados
function printResults() {
    window.print();
}

// Actualizar resultados en tiempo real (si se llama desde la página principal)
async function updateResults() {
    await loadAndDisplayData();
}

async function resetCurrentGame() {
    // Mostrar modal de confirmación en lugar de confirm()
    const modal = document.getElementById('confirmResetModal');
    const cancelBtn = document.getElementById('cancelResetBtn');
    const confirmBtn = document.getElementById('confirmResetBtn');
    if (!modal || !cancelBtn || !confirmBtn) {
        console.error('Modal de confirmación no encontrado en el DOM. Asegúrate de que resultados.html contiene el modal.');
        return;
    }

    // Mostrar modal
    modal.classList.remove('hidden');

    const closeModal = () => {
        modal.classList.add('hidden');
        cancelBtn.removeEventListener('click', onCancel);
        confirmBtn.removeEventListener('click', onConfirm);
    };

    const onCancel = () => {
        closeModal();
    };

    const onConfirm = async () => {
        closeModal();
        const gameName = currentGameType === 'polla' ? 'Polla' : 'Micro';
        try {
            let deleteResult;
            if (currentGameType === 'polla') {
                // Asumo que existe una función `borrarTodas` en el objeto `JugadasPollaDB`
                deleteResult = await JugadasPollaDB.borrarTodas();
            } else {
                // Asumo que existe una función `borrarTodas` en el objeto `JugadasMicroDB`
                deleteResult = await JugadasMicroDB.borrarTodas();
            }

            if (deleteResult.success) {
                alert(`Todas las jugadas de la ${gameName} han sido borradas.`);
                await loadAndDisplayData(); // Recargar la vista para reflejar los cambios
            } else {
                // Usar un mensaje de error más detallado si está disponible
                const errorMessage = deleteResult.error ? deleteResult.error.message : 'Ocurrió un error desconocido.';
                alert(`Error al borrar las jugadas: ${errorMessage}`);
            }
        } catch (error) {
            console.error(`Error al intentar resetear las jugadas de ${gameName}:`, error);
            alert('Se produjo un error inesperado. Revisa la consola para más detalles.');
        }
    }
}

// Función para generar imagen preliminar dinámica
function generatePreviewImage() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1200;
    canvas.height = 630;

    // Fondo con gradiente similar al sitio
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#f8d74b');
    gradient.addColorStop(1, '#ffc000');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Título
    ctx.fillStyle = '#a61c00';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🐦‍🔥 RESULTADOS POLLA EL FÉNIX 🐦‍🔥', canvas.width / 2, 60);

    // Números ganadores
    if (winningNumbers.length > 0) {
        ctx.fillStyle = '#000';
        ctx.font = 'bold 24px Arial';
        ctx.fillText('Resultados del día', canvas.width / 2, 120);

        winningNumbers.forEach((num, index) => {
            // Draw yellow rounded rectangle
            ctx.fillStyle = '#facc15'; // Yellow-400
            // roundRect is supported in modern browsers. Fallback to fillRect if needed or use a polyfill logic, 
            // but for simplicity in this environment we can assume modern support or just use fillRect if we want to be super safe. 
            // However, user asked for "como la imagen" (rounded).
            if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(canvas.width / 2 - 150 + index * 50, 140, 40, 40, 5);
                ctx.fill();
            } else {
                ctx.fillRect(canvas.width / 2 - 150 + index * 50, 140, 40, 40);
            }

            ctx.fillStyle = '#000'; // Black text
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            // Adjust text position for center alignment
            ctx.fillText(num, canvas.width / 2 - 130 + index * 50, 168);
        });
    }

    // Estadísticas
    ctx.fillStyle = '#000';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Total Jugadas: ${resultsData.length}`, 50, 250);
    ctx.fillText(`Ganadores: ${resultsData.filter(p => p.hits === (currentGameType === 'polla' ? 6 : 3)).length}`, 50, 300);
    // Usar el label dinámico de la UI para mantener consistencia (Premio + Acumulado o Premio Total)
    const premioLabelEl = document.getElementById('premioAcum');
    const premioLabel = premioLabelEl ? premioLabelEl.textContent : 'Premio Total';
    const totalPrizeText = document.getElementById('totalPrizeResult') ? document.getElementById('totalPrizeResult').textContent : '0 BS';
    ctx.fillText(`${premioLabel}: ${totalPrizeText}`, 50, 350);
    ctx.fillText(`Premio por Ganador: ${document.getElementById('prizePerWinnerResult').textContent}`, 50, 400);

    // Logo o imagen adicional (opcional)
    const logo = new Image();
    logo.onload = () => {
        ctx.drawImage(logo, canvas.width - 150, canvas.height - 150, 120, 120);
        updateMetaTags(canvas.toDataURL());
    };
    logo.onerror = () => {
        updateMetaTags(canvas.toDataURL());
    };
    logo.src = 'Logo Fenix.png'; // Ajusta la ruta si es necesario
}

// Función para actualizar meta tags con la imagen generada
function updateMetaTags(imageDataUrl) {
    try {
        // Create URL with current game parameter
        const currentUrl = new URL(window.location);
        currentUrl.searchParams.set('game', currentGameType);

        // Update og:title
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) {
            ogTitle.setAttribute('content', `Resultados del Día - ${currentGameType === 'polla' ? 'Polla' : 'Micro'} El Fénix`);
        }

        // Update og:description with proper null checks
        const ogDescription = document.querySelector('meta[property="og:description"]');
        if (ogDescription) {
            const winningNumbersText = winningNumbers.length > 0 ? winningNumbers.join(', ') : 'No disponibles';
            const premioLabelEl = document.getElementById('premioAcum');
            const premioLabelText = premioLabelEl ? premioLabelEl.textContent : 'Premio Total';
            const totalPrizeElement = document.getElementById('totalPrizeResult');
            const prizeText = totalPrizeElement ? totalPrizeElement.textContent : '0 BS';

            ogDescription.setAttribute('content', `Resultados de hoy: ${winningNumbersText} | Jugadas: ${resultsData.length} | ${premioLabelText}: ${prizeText}`);
        }

        // Update og:image
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) {
            ogImage.setAttribute('content', imageDataUrl);
        }

        // Update og:url
        const ogUrl = document.querySelector('meta[property="og:url"]');
        if (ogUrl) {
            ogUrl.setAttribute('content', currentUrl.toString());
        }

        // Update twitter:card
        const twitterCard = document.querySelector('meta[name="twitter:card"]');
        if (twitterCard) {
            twitterCard.setAttribute('content', 'summary_large_image');
        }
    } catch (error) {
        console.error('Error updating meta tags:', error);
    }
}

// Función para generar PDF con resultados
async function generatePDF() {
    console.log('Iniciando generación de PDF...');
    try {
        if (!window.jspdf) {
            alert('Error: La librería jsPDF no está cargada. Por favor recarga la página.');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Cargar logo
        const logoUrl = 'Logo Fenix.png';
        const logoImg = new Image();
        logoImg.src = logoUrl;

        logoImg.onload = function () {
            createPDF(doc, logoImg);
        };

        logoImg.onerror = function () {
            console.warn('No se pudo cargar el logo, generando PDF sin él.');
            createPDF(doc, null);
        };
    } catch (e) {
        console.error('Error en generatePDF:', e);
        alert('Error al generar PDF: ' + e.message);
    }
}

function createPDF(doc, logoImg) {
    try {
        const gameTitle = currentGameType === 'polla' ? 'POLLA (6 NUMEROS)' : 'MICRO (3 NUMEROS)';
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;

        // Check removed to allow download without results


        // --- HEADER DESIGN ---
        // Add a top banner
        doc.setFillColor(220, 38, 38); // Rojo Fenix
        doc.rect(0, 0, pageWidth, 25, 'F');

        // Logo (White background circle or just overlay if transparent)
        if (logoImg) {
            // Draw a white circle behind logo to make it pop if needed, or just place it
            doc.addImage(logoImg, 'PNG', 14, 2, 21, 21);
        }

        // Title (White text on Red banner)
        const gameName = currentGameType === 'polla' ? 'Polla' : 'Micro';
        doc.setFontSize(16);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text(`Resultados Pollas El Fenix - ${gameName}`, pageWidth / 2, 16, { align: 'center' });

        // Date (Below banner)
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-VE');
        const timeStr = now.toLocaleTimeString('es-VE');
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generado el: ${dateStr} a las ${timeStr}`, pageWidth - 14, 32, { align: 'right' });

        // --- WINNING NUMBERS SECTION ---
        let startY = 40;
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text('Resultados del día', 14, startY);

        if (winningNumbers.length === 0) {
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.setFont('helvetica', 'italic');
            doc.text('No registrados', 60, startY);
        } else {
            // Rounded squares as requested
            const squareSize = 10;
            const spacingBetweenCenters = 14;
            let ballX = 60; // Start position next to label
            const ballY = startY - 7; // Adjust Y to center with text

            winningNumbers.forEach(num => {
                doc.setFillColor(250, 204, 21); // Yellow
                doc.setDrawColor(234, 179, 8); // Darker yellow border
                // roundedRect(x, y, w, h, rx, ry, style)
                doc.roundedRect(ballX, ballY, squareSize, squareSize, 2, 2, 'FD');

                doc.setTextColor(0);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                // Center text in the square
                doc.text(String(num), ballX + squareSize / 2, ballY + squareSize / 2, { align: 'center', baseline: 'middle' });

                ballX += spacingBetweenCenters;
            });
        }

        // --- TABLE ---
        const columns = [
            { header: '#', dataKey: 'index' },
            { header: 'Nombre', dataKey: 'name' },
            { header: 'Números', dataKey: 'numbers' },
            { header: 'Aciertos', dataKey: 'hits' }
        ];

        const rows = resultsData.map((player, index) => ({
            index: player.seq_id,
            name: player.name,
            numbers: '',
            rawNumbers: player.numbers,
            hits: player.hits,
            rawHits: player.hits
        }));

        const colors = {
            6: [2, 255, 0],
            5: [18, 117, 251],
            4: [0, 119, 182],
            3: [3, 179, 216],
            2: [74, 202, 229],
            1: [145, 224, 240]
        };

        doc.autoTable({
            startY: startY + 10,
            columns: columns, // Pass columns definition
            body: rows,       // Pass full objects to preserve raw data
            theme: 'grid',
            headStyles: {
                fillColor: [50, 50, 50], // Dark gray header for better contrast
                textColor: 255,
                fontStyle: 'bold',
                halign: 'center',
                fontSize: 9
            },
            styles: {
                fontSize: 8,
                cellPadding: 2,
                textColor: 0,
                valign: 'middle',
                lineColor: [200, 200, 200],
                lineWidth: 0.1
            },
            columnStyles: {
                0: { cellWidth: 12, halign: 'center' },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 'auto', halign: 'center' },
                3: { cellWidth: 18, halign: 'center' }
            },
            didParseCell: function (data) {
                if (data.section === 'body') {
                    // Now data.row.raw should be the object from 'rows'
                    const h = data.row.raw.rawHits;
                    const maxHits = currentGameType === 'polla' ? 6 : 3;
                    let fillColor = null;
                    let textColor = 0;

                    if (h === maxHits && h > 0) {
                        fillColor = [2, 255, 0];
                    } else if (currentGameType === 'polla') {
                        if (h === 5) { fillColor = [18, 117, 251]; textColor = 255; }
                        else if (h === 4) { fillColor = [0, 119, 182]; textColor = 255; }
                        else if (h === 3) fillColor = [3, 179, 216];
                        else if (h === 2) fillColor = [74, 202, 229];
                        else if (h === 1) fillColor = [145, 224, 240];
                    } else if (currentGameType === 'micro') {
                        if (h === 2) fillColor = [3, 179, 216];
                        else if (h === 1) fillColor = [145, 224, 240];
                    }

                    if (fillColor) {
                        data.cell.styles.fillColor = fillColor;
                        data.cell.styles.textColor = textColor;
                    }
                }
            },
            didDrawCell: function (data) {
                if (data.section === 'body' && data.column.dataKey === 'numbers') {
                    const numbers = data.row.raw.rawNumbers;
                    // Safety check
                    if (!numbers || !Array.isArray(numbers)) return;

                    const cell = data.cell;
                    const cellWidth = cell.width;
                    const cellHeight = cell.height;
                    const startX = cell.x;
                    const startY = cell.y;

                    const numRadius = 3;
                    const numSpacing = 8;

                    const totalNumsWidth = (numbers.length - 1) * numSpacing;
                    let currentX = startX + (cellWidth / 2) - (totalNumsWidth / 2);
                    const currentY = startY + (cellHeight / 2);

                    numbers.forEach(num => {
                        const isWinner = winningNumbers.includes(num);

                        if (isWinner) {
                            doc.setFillColor(22, 163, 74);
                            doc.circle(currentX, currentY, numRadius, 'F');
                            doc.setTextColor(255);
                        } else {
                            doc.setTextColor(0);
                        }

                        doc.setFontSize(7);
                        doc.setFont('helvetica', 'bold');
                        doc.text(String(num), currentX, currentY + 1, { align: 'center' });

                        currentX += numSpacing;
                    });
                }
            },
            // Add Footer with page numbers
            didDrawPage: function (data) {
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text('Página ' + doc.internal.getNumberOfPages(), pageWidth / 2, pageHeight - 10, { align: 'center' });
            }
        });

        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const dateFileStr = `${day}-${month}-${year}`;
        const gameNameFile = currentGameType === 'polla' ? 'Polla' : 'Micro';
        const fileName = `Resultados Pollas El Fenix - ${gameNameFile} ${dateFileStr}.pdf`;
        doc.save(fileName);
    } catch (e) {
        console.error('Error in createPDF:', e);
        alert('Error al crear el contenido del PDF: ' + e.message);
    }
}

// Exportar función para uso global
window.generatePDF = generatePDF;

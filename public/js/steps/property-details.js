import { $, $$, escHtml } from '../utils.js';

export function initPropertyDetails(uploadData, nextCallback) {
    const btnNext = $('#btnStep1Next');
    const inputName = $('#inputPropertyName');
    const inputAddress = $('#inputPropertyAddress');

    // Next button
    btnNext.addEventListener('click', () => {
        uploadData.propertyName = inputName.value.trim();
        uploadData.propertyAddress = inputAddress.value.trim();
        if (!uploadData.propertyName) {
            inputName.focus();
            inputName.classList.add('border-red-400');
            return;
        }
        inputName.classList.remove('border-red-400');
        nextCallback();
    });

    // Autocomplete
    setupAddressAutocomplete(uploadData);
}

function setupAddressAutocomplete(uploadData) {
    const input = $('#inputPropertyAddress');
    const list = $('#addressSuggestions');
    const iconContainer = input.parentElement.querySelector('.absolute .material-icons');
    let debounceTimer;

    input.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();

        if (query.length < 3) {
            list.classList.add('hidden');
            return;
        }

        // Show loading state
        if (iconContainer) {
            iconContainer.textContent = 'sync';
            iconContainer.classList.add('animate-spin', 'text-primary');
            iconContainer.classList.remove('text-slate-400');
        }

        debounceTimer = setTimeout(async () => {
            try {
                // Using Photon (Komoot)
                const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en`);
                const data = await res.json();

                if (data.features && data.features.length > 0) {
                    list.innerHTML = data.features.map(f => {
                        const props = f.properties;
                        const parts = [props.name, props.street, props.city, props.state, props.postcode, props.country]
                            .filter(Boolean);
                        const uniqueParts = [...new Set(parts)];
                        const displayName = uniqueParts.join(', ');

                        return `
                        <li class="px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-700 border-b border-slate-50 last:border-0 transition-colors" data-display-name="${escHtml(displayName)}">
                            <div class="flex items-center gap-2">
                                <span class="material-icons-round text-slate-400 text-xs">location_on</span>
                                <span class="truncate">${escHtml(displayName)}</span>
                            </div>
                        </li>`;
                    }).join('');
                    list.classList.remove('hidden');

                    list.querySelectorAll('li').forEach(li => {
                        li.addEventListener('click', () => {
                            input.value = li.dataset.displayName;
                            uploadData.propertyAddress = li.dataset.displayName;
                            list.classList.add('hidden');
                        });
                    });
                } else {
                    list.classList.add('hidden');
                }
            } catch (err) {
                console.error('Address search failed:', err);
            } finally {
                // Reset loading state
                if (iconContainer) {
                    iconContainer.textContent = 'location_on';
                    iconContainer.classList.remove('animate-spin', 'text-primary');
                    iconContainer.classList.add('text-slate-400');
                }
            }
        }, 300);
    });

    // Close on outside click is handled better globally or implicitly by focusing out? 
    // Let's attach listener to document locally to this scope for now, mindful of leaks if re-initialized often.
    // Ideally this listener should be added once. But since initPropertyDetails is likely called once on load, it's fine.
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !list.contains(e.target)) {
            list.classList.add('hidden');
        }
    });
}

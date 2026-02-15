import { $, $$, escHtml, formatTimestamp } from './js/utils.js';
import { initPropertyDetails } from './js/steps/property-details.js';
import { initMediaUpload } from './js/steps/media-upload.js';
import { initReviewSubmit, updateReviewUI } from './js/steps/review-submit.js';

// Global State
let currentView = 'dashboard';
const uploadData = {
    propertyName: '',
    propertyAddress: '',
    video: null,
    photos: []
};

// ══════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    // Nav
    $('.nav-link[data-view="dashboard"]').addEventListener('click', () => navigate('dashboard'));
    $('.nav-link[data-view="upload"]').addEventListener('click', () => navigate('upload'));
    $('#btnNewCapture').addEventListener('click', () => navigate('upload'));
    $('#btnEmptyNewCapture').addEventListener('click', () => navigate('upload'));

    setupUploadWizard();

    // Initial load
    navigate('dashboard');

    // Check server
    checkServerStatus();
    setInterval(checkServerStatus, 30000);

    // Poll processing
    setInterval(pollProcessingStatus, 2000);
});


// ══════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════
function navigate(viewName) {
    currentView = viewName;

    // Update Sidebar
    $$('.nav-link').forEach(l => {
        if (l.dataset.view === viewName) {
            l.classList.add('bg-primary/10', 'text-primary');
            l.classList.remove('text-slate-500', 'hover:bg-slate-50');
        } else {
            l.classList.remove('bg-primary/10', 'text-primary');
            l.classList.add('text-slate-500', 'hover:bg-slate-50');
        }
    });

    // Show Section
    $$('.view-section').forEach(s => s.classList.remove('active'));

    if (viewName === 'dashboard') {
        $('#viewDashboard').classList.add('active');
        loadProperties();
    } else if (viewName === 'upload') {
        $('#viewUpload').classList.add('active');
        resetUpload();
    } else if (viewName === 'processing') {
        $('#viewProcessing').classList.add('active');
    } else if (viewName === 'detail') {
        $('#viewDetail').classList.add('active');
    }
}

// ══════════════════════════════════════════════════
// UPLOAD WIZARD
// ══════════════════════════════════════════════════

let currentStep = 1;

function resetUpload() {
    currentStep = 1;
    // Reset data object properties instead of reassigning the object
    uploadData.propertyName = '';
    uploadData.propertyAddress = '';
    uploadData.video = null;
    uploadData.photos.length = 0; // Clear array
    delete uploadData.videoMetadata;

    $('#inputPropertyName').value = '';
    $('#inputPropertyAddress').value = '';
    $('#inputVideo').value = '';
    $('#inputPhotos').value = '';
    $('#inputTranscript').value = '';
    $('#inputRoomBoundaries').value = '';
    $('#videoSelected').classList.add('hidden');
    $('#videoPreviewContainer').classList.add('hidden');
    $('#videoPreviewPlayer').src = '';
    $('#videoPlaceholder').classList.remove('hidden');
    $('#photoPreviewGrid').innerHTML = '';
    $('#photoCount').textContent = '0 selected';
    updateStepperUI();
    showStep(1);

    // Reset validations (if any classes left)
    $('#inputPropertyName').classList.remove('border-red-400');
}

function showStep(step) {
    $$('.upload-step').forEach(s => s.classList.add('hidden'));
    $(`#uploadStep${step}`).classList.remove('hidden');
    currentStep = step;
    updateStepperUI();
}

function updateStepperUI() {
    const steps = $$('#uploadStepper [data-step]');
    steps.forEach(s => {
        const n = parseInt(s.dataset.step);
        const circle = s.querySelector('.step-circle');
        const label = s.querySelector('span:last-child');
        if (n < currentStep) {
            // Completed
            circle.className = 'step-circle flex items-center justify-center w-10 h-10 bg-primary text-white rounded-full ring-4 ring-background-light font-semibold';
            circle.innerHTML = '<span class="material-icons-round text-sm">check</span>';
            label.className = 'mt-2 text-xs font-medium text-primary uppercase tracking-wide';
        } else if (n === currentStep) {
            // Active
            circle.className = 'step-circle flex items-center justify-center w-10 h-10 bg-primary text-white rounded-full ring-4 ring-primary/20 shadow-lg shadow-primary/30 font-bold';
            circle.innerHTML = `<span class="text-sm">${n}</span>`;
            label.className = 'mt-2 text-xs font-bold text-primary uppercase tracking-wide';
        } else {
            // Pending
            circle.className = 'step-circle flex items-center justify-center w-10 h-10 bg-white border-2 border-slate-200 text-slate-400 rounded-full ring-4 ring-background-light font-semibold';
            circle.innerHTML = `<span class="text-sm">${n}</span>`;
            label.className = 'mt-2 text-xs font-medium text-slate-400 uppercase tracking-wide';
        }
    });
}

function setupUploadWizard() {
    // Step 1
    initPropertyDetails(uploadData, () => showStep(2));

    // Step 2
    initMediaUpload(uploadData, () => {
        // Go to Review
        updateReviewUI(uploadData);
        showStep(3);
    }, () => showStep(1));

    // Step 3
    initReviewSubmit(uploadData, submitCapture, () => showStep(2));
}

async function submitCapture() {
    const btn = $('#btnSubmitCapture');
    // Basic validation
    if (!uploadData.propertyName) {
        alert('Missing property name');
        showStep(1);
        return;
    }

    // Prepare FormData
    const fd = new FormData();
    // Ensure we send even if empty string
    fd.append('propertyName', uploadData.propertyName || '');
    fd.append('propertyAddress', uploadData.propertyAddress || '');

    // Metadata
    const transcript = $('#inputTranscript').value;
    if (transcript) fd.append('transcript', transcript);

    const boundaries = $('#inputRoomBoundaries').value;
    if (boundaries) fd.append('roomBoundaries', boundaries);

    if (uploadData.video) {
        fd.append('video', uploadData.video);
        if (uploadData.videoMetadata) {
            fd.append('durationSeconds', uploadData.videoMetadata.durationSeconds);
            fd.append('width', uploadData.videoMetadata.width);
            fd.append('height', uploadData.videoMetadata.height);
        }
    }

    uploadData.photos.forEach(p => fd.append('photos', p));

    // Initial state set
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round animate-spin mr-2">sync</span> Uploading...';

    try {
        const res = await fetch('/api/capture/upload', { method: 'POST', body: fd });
        const data = await res.json();

        if (data.captureId) {
            startProcessing(data.captureId, uploadData.propertyName);
        } else {
            alert('Upload failed: ' + (data.error || 'Unknown error'));
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons-round mr-2">rocket_launch</span> Upload & Process';
        }
    } catch (err) {
        console.error(err);
        alert('Network error during upload');
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons-round mr-2">rocket_launch</span> Upload & Process';
    }
}


// ══════════════════════════════════════════════════
// PROCESSING STATUS
// ══════════════════════════════════════════════════
let activeCaptureId = null;

function startProcessing(captureId, propertyName) {
    activeCaptureId = captureId;
    $('#processingPropertyName').textContent = propertyName;
    navigate('processing');
    pollProcessingStatus();
}

async function pollProcessingStatus() {
    if (currentView !== 'processing' || !activeCaptureId) return;

    try {
        const res = await fetch(`/api/capture/${activeCaptureId}/status`);
        const status = await res.json();

        updateProcessingUI(status);

        if (status.status === 'complete') {
            activeCaptureId = null;
            setTimeout(() => {
                navigate('dashboard');
            }, 2000);
        }
    } catch (err) {
        console.error('Poll error', err);
    }
}

function updateProcessingUI(status) {
    // Backend steps: transcription, roomSegmentation, inventoryExtraction, photoAssociation, notionSync
    const steps = ['transcription', 'roomSegmentation', 'inventoryExtraction', 'photoAssociation', 'notionSync'];

    // If entire capture is complete
    if (status.status === 'complete') {
        $('#processingStatusText').textContent = 'Completed!';
        steps.forEach(s => setProcStepStatus(s, 'done'));
        $('#processingPercent').textContent = '100%';
        $('#processingEta').textContent = '0s';
        return;
    }

    // If failed
    if (status.status === 'failed') {
        $('#processingStatusText').textContent = 'Processing Failed';
        // You might want to show error state here
        return;
    }

    // Calculate progress based on individual step statuses in status.progress
    let activeFound = false;
    let completedCount = 0;

    steps.forEach((stepName) => {
        const stepStatus = status.progress ? status.progress[stepName] : 'pending';

        if (stepStatus === 'complete') {
            setProcStepStatus(stepName, 'done');
            completedCount++;
        } else if (stepStatus === 'processing') {
            setProcStepStatus(stepName, 'active');
            activeFound = true;
            $('#processingStatusText').textContent = `Processing: ${getReadableStepName(stepName)}...`;
        } else if (stepStatus === 'failed') {
            // Handle step failure if needed, or just leave as waiting/error
            // For now, maybe just show as active or special error state
            setProcStepStatus(stepName, 'waiting');
        } else {
            setProcStepStatus(stepName, 'waiting');
        }
    });

    // Update percentage (roughly)
    const percent = Math.round((completedCount / steps.length) * 100);
    $('#processingPercent').textContent = `${percent}%`;

    // Simple ETA (placeholder logic)
    const remaining = steps.length - completedCount;
    $('#processingEta').textContent = `~${remaining * 10}s`;
}

function getReadableStepName(step) {
    const map = {
        'transcription': 'Transcription',
        'roomSegmentation': 'Room Segmentation',
        'inventoryExtraction': 'Inventory',
        'photoAssociation': 'Photo Analysis',
        'notionSync': 'Notion Sync'
    };
    return map[step] || step;
}

function setProcStepStatus(stepName, state) {
    const el = $(`.proc-step[data-proc-step="${stepName}"]`);
    if (!el) return;

    const iconDiv = el.querySelector('.proc-step-icon');
    const desc = el.querySelector('.proc-step-desc');
    const icon = iconDiv.querySelector('.material-icons-round');

    if (state === 'done') {
        iconDiv.className = 'proc-step-icon flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-white ring-4 ring-emerald-50';
        icon.className = 'material-icons-round text-sm';
        icon.textContent = 'check';
        desc.textContent = 'Completed';
        desc.className = 'text-xs text-emerald-600 mt-0.5 proc-step-desc font-medium';
    } else if (state === 'active') {
        iconDiv.className = 'proc-step-icon flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white ring-4 ring-primary/10 shadow-lg shadow-primary/20 animate-pulse-slow';
        icon.className = 'material-icons-round text-sm animate-spin-slow';
        icon.textContent = 'sync'; // or original icon, stick to sync for active
        desc.textContent = 'Processing...';
        desc.className = 'text-xs text-primary mt-0.5 proc-step-desc font-medium';
    } else {
        // waiting
        iconDiv.className = 'proc-step-icon flex items-center justify-center w-8 h-8 rounded-full bg-slate-50 border-2 border-slate-200 ring-4 ring-white';
        icon.className = 'material-icons-round text-sm text-slate-400';
        // reset icon based on step name mappings if needed, but keeping generic is fine or simple logic
        // We lost original icon in 'done'/'active' replace? NO, we just changed textContent. 
        // Ideally we should store original icon.
        // For simplicity, let's just reset textContent based on step map or just leave previous if we traverse forward only.
        // But if we refresh logic, we might need restoration.
        // Let's rely on manual restoration for now or just generic icons.
        if (stepName === 'transcription') icon.textContent = 'mic';
        if (stepName === 'roomSegmentation') icon.textContent = 'grid_view';
        if (stepName === 'inventoryExtraction') icon.textContent = 'inventory_2';
        if (stepName === 'photoAssociation') icon.textContent = 'photo_library';
        if (stepName === 'notionSync') icon.textContent = 'sync';

        desc.textContent = 'Waiting';
        desc.className = 'text-xs text-slate-400 mt-0.5 proc-step-desc';
    }
}


// ══════════════════════════════════════════════════
// DASHBOARD & DETAILS
// ══════════════════════════════════════════════════

async function loadProperties() {
    try {
        const res = await fetch('/api/capture/list');
        const data = await res.json();
        const captures = data.captures || [];

        renderDashboard(captures);
        renderStats(captures);
    } catch (err) {
        console.error('Failed to load properties', err);
    }
}

function renderStats(captures) {
    $('#statTotal').textContent = captures.length;
    $('#statProcessing').textContent = captures.filter(c => c.status !== 'complete' && c.status !== 'error').length;
    $('#statReview').textContent = '0'; // Placeholder logic
    $('#statComplete').textContent = captures.filter(c => c.status === 'complete').length;
}

function renderDashboard(captures) {
    const grid = $('#propertiesGrid');
    const empty = $('#emptyState');

    if (captures.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    grid.innerHTML = captures.map(c => {
        // Safe access
        const meta = c.result ? c.result.metadata : {};
        const name = c.propertyName || meta.propertyName || `Capture #${c.id.substr(0, 8)}`;
        const addr = c.propertyAddress || meta.propertyAddress || 'No address';
        const date = c.date ? new Date(c.date).toLocaleDateString() : 'Unknown Date';

        let statusBadge = '';
        if (c.status === 'complete') {
            statusBadge = `<span class="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-bold uppercase tracking-wide">Completed</span>`;
        } else if (c.status === 'error') {
            statusBadge = `<span class="px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-bold uppercase tracking-wide">Error</span>`;
        } else {
            statusBadge = `<span class="px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs font-bold uppercase tracking-wide">Processing</span>`;
        }

        return `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col group relative">
            <div class="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="event.stopPropagation(); deleteCapture('${c.id}')" class="bg-white/90 p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-white shadow-sm border border-slate-200 transition-all" title="Delete Property">
                    <span class="material-icons-round text-sm">delete</span>
                </button>
            </div>
            <div class="h-32 bg-slate-100 relative cursor-pointer" onclick="openDetail('${c.id}')">
                 <div class="absolute inset-0 flex items-center justify-center text-slate-300">
                    <span class="material-icons-round text-4xl">image</span>
                 </div>
                 <!-- If we had a thumbnail, img here -->
            </div>
            <div class="p-5 flex-1 flex flex-col cursor-pointer" onclick="openDetail('${c.id}')">
                <div class="flex justify-between items-start mb-2">
                    ${statusBadge}
                    <span class="text-xs text-slate-400 font-medium">${date}</span>
                </div>
                <h3 class="text-lg font-bold text-slate-900 mb-1 truncate">${escHtml(name)}</h3>
                <p class="text-sm text-slate-500 mb-4 flex items-center gap-1 truncate">
                    <span class="material-icons-round text-xs">location_on</span>
                    ${escHtml(addr)}
                </p>
            </div>
        </div>
        `;
    }).join('');
}

// Global scope for onclick handlers
window.deleteCapture = async function (id) {
    if (!confirm('Are you sure you want to delete this property? This action cannot be undone.')) return;

    try {
        const res = await fetch(`/api/capture/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadProperties();
        } else {
            console.error(`Delete failed: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error('Response body:', text);

            let errorMsg = 'Unknown error';
            try {
                const data = JSON.parse(text);
                errorMsg = data.details ? `${data.error}: ${data.details}` : (data.error || data.message || 'Unknown error');
            } catch (e) {
                // If not JSON, use the status text or snippet of body
                errorMsg = `Server returned ${res.status}: ${text.substring(0, 50)}...`;
            }
            alert(`Failed to delete property. ${errorMsg}`);
        }
    } catch (err) {
        console.error(err);
        alert('Error deleting property');
    }
};

// Make openDetail available globally since it's called via onclick string
window.openDetail = async function (captureId) {
    try {
        const res = await fetch(`/api/capture/${captureId}/result`);
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        renderDetail(data);
        navigate('detail');
    } catch (err) {
        console.error(err);
        alert('Could not load details');
    }
};


function renderDetail(data) {
    // Basic binding
    const meta = data.metadata || {};
    $('#detailTitle').textContent = meta.propertyName || 'Untitled';
    $('#detailAddressText').textContent = meta.propertyAddress || 'No address';

    // Summary Metrics
    const report = data.report || {};
    const rooms = report.rooms || [];
    const items = report.inventory ? report.inventory.length : 0;

    // Render Metrics Cards
    const metricsHtml = `
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Total Rooms</p>
            <p class="text-2xl font-bold text-slate-900">${rooms.length}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Total Items</p>
            <p class="text-2xl font-bold text-slate-900">${items}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Condition</p>
            <p class="text-2xl font-bold text-emerald-600">Good</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Processing</p>
            <p class="text-2xl font-bold text-emerald-600">Complete</p>
        </div>
    `;
    $('#detailMetrics').innerHTML = metricsHtml;

    // Gallery
    const gallery = $('#detailGallery');
    gallery.innerHTML = '';
    // Placeholder gallery for now as we don't have easy public URLs yet without a file server
    gallery.innerHTML = `
        <div class="bg-slate-100 flex items-center justify-center text-slate-300">
            <span class="material-icons-round text-4xl">image</span>
        </div>
        <div class="bg-slate-100 flex items-center justify-center text-slate-300">
            <span class="material-icons-round text-4xl">image</span>
        </div>
        <div class="bg-slate-100 flex items-center justify-center text-slate-300">
            <span class="material-icons-round text-4xl">image</span>
        </div>
        <div class="bg-slate-100 flex items-center justify-center text-slate-300 sm:hidden md:flex">
             <span class="material-icons-round text-4xl">more_horiz</span>
        </div>
    `;

    // Rooms List
    const roomList = $('#detailRooms');
    if (rooms.length === 0) {
        roomList.innerHTML = '<p class="text-slate-500 italic">No rooms detected.</p>';
    } else {
        roomList.innerHTML = rooms.map(r => `
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 class="font-bold text-slate-900 flex items-center gap-2">
                        <span class="material-icons text-slate-400 text-sm">meeting_room</span> ${escHtml(r.name || r.roomName || 'Unknown Room')}
                    </h3>
                    <span class="text-xs font-mono text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">
                        ${formatTimestamp(r.timestampStart)} - ${formatTimestamp(r.timestampEnd)}
                    </span>
                </div>
                <div class="p-4">
                    <p class="text-sm text-slate-600 mb-4">${escHtml(r.description || 'No description available.')}</p>
                    
                    ${r.inventory && r.inventory.length > 0 ? `
                    <div class="mt-4">
                        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Inventory</h4>
                        <div class="flex flex-wrap gap-2">
                            ${r.inventory.map(i => `
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                    ${escHtml(i)}
                                </span>
                            `).join('')}
                        </div>
                    </div>` : ''}
                </div>
            </div>
        `).join('');
    }

    // Transcript
    const transcriptText = data.transcript ? data.transcript.map(t => `[${formatTimestamp(t.timestampSeconds)}] ${t.text}`).join('\n') : 'No transcript available.';
    $('#detailTranscript').innerText = transcriptText; // use innerText for newlines

    // Back listener (ensure we don't duplicate if called multiple times)
    const btnBack = $('#btnBackToDashboard');
    if (btnBack) {
        btnBack.onclick = () => navigate('dashboard');
    }
}


// SERVER CHECK
async function checkServerStatus() {
    const dot = $('#statusDot');
    const text = $('#statusText');
    try {
        const res = await fetch('/api/health');
        if (res.ok) {
            dot.classList.remove('bg-slate-300', 'bg-red-500');
            dot.classList.add('bg-emerald-500', 'shadow-[0_0_8px_rgba(16,185,129,0.4)]');
            text.textContent = 'System Online';
            text.classList.remove('text-red-500');
            text.classList.add('text-emerald-600');
        } else {
            throw new Error('Health check failed');
        }
    } catch (e) {
        dot.classList.remove('bg-emerald-500', 'shadow-[0_0_8px_rgba(16,185,129,0.4)]');
        dot.classList.add('bg-red-500');
        text.textContent = 'Connection Lost';
        text.classList.remove('text-emerald-600');
        text.classList.add('text-red-500');
    }
}

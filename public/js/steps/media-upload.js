import { $, $$, formatBytes } from '../utils.js';

let cameraStream = null;
let mediaRecorder = null;
let recordedChunks = [];

export function initMediaUpload(uploadData, nextCallback, backCallback) {
    const btnNext = $('#btnStep2Next');
    const btnBack = $('#btnStep2Back');

    btnNext.addEventListener('click', nextCallback);
    btnBack.addEventListener('click', backCallback);

    setupVideoUpload(uploadData);
    setupPhotoUpload(uploadData);
    setupCameraUI(uploadData);
}

function setupVideoUpload(uploadData) {
    const videoZone = $('#videoDropZone');
    const videoInput = $('#inputVideo');

    videoZone.addEventListener('click', () => videoInput.click());
    videoZone.addEventListener('dragover', e => { e.preventDefault(); videoZone.classList.add('border-primary', 'bg-primary/5'); });
    videoZone.addEventListener('dragleave', () => { videoZone.classList.remove('border-primary', 'bg-primary/5'); });
    videoZone.addEventListener('drop', e => {
        e.preventDefault();
        videoZone.classList.remove('border-primary', 'bg-primary/5');
        if (e.dataTransfer.files[0]) setVideoFile(e.dataTransfer.files[0], uploadData);
    });

    videoInput.addEventListener('change', () => { if (videoInput.files[0]) setVideoFile(videoInput.files[0], uploadData); });

    $('#videoClear').addEventListener('click', (e) => {
        e.stopPropagation();
        uploadData.video = null;
        uploadData.videoMetadata = null;
        $('#videoSelected').classList.add('hidden');
        $('#videoPreviewContainer').classList.add('hidden');
        $('#videoPreviewPlayer').src = ''; // Release memory
        $('#videoPlaceholder').classList.remove('hidden');
        videoInput.value = '';
    });
}

function setVideoFile(file, uploadData) {
    uploadData.video = file;
    $('#videoFileName').textContent = file.name;
    $('#videoFileSize').textContent = formatBytes(file.size);

    // Reset metadata
    $('#videoDuration').textContent = 'Loading...';
    $('#videoResolution').textContent = '';

    // UI toggle
    $('#videoPlaceholder').classList.add('hidden');
    $('#videoSelected').classList.remove('hidden');
    $('#videoPreviewContainer').classList.remove('hidden');

    const videoPlayer = $('#videoPreviewPlayer');
    const url = URL.createObjectURL(file);
    videoPlayer.src = url;

    // Load metadata
    videoPlayer.onloadedmetadata = () => {
        const duration = Math.round(videoPlayer.duration);
        const resolution = `${videoPlayer.videoWidth}x${videoPlayer.videoHeight}`;

        $('#videoDuration').textContent = formatTimestamp(duration);
        $('#videoResolution').textContent = resolution;

        // Save to uploadData for later use/backend
        uploadData.videoMetadata = {
            durationSeconds: duration,
            width: videoPlayer.videoWidth,
            height: videoPlayer.videoHeight
        };
    };

    videoPlayer.load();
}

function setupPhotoUpload(uploadData) {
    const photosZone = $('#photosDropZone');
    const photosInput = $('#inputPhotos');

    photosZone.addEventListener('click', () => photosInput.click());
    photosZone.addEventListener('dragover', e => { e.preventDefault(); photosZone.classList.add('border-primary', 'bg-primary/10'); });
    photosZone.addEventListener('dragleave', () => { photosZone.classList.remove('border-primary', 'bg-primary/10'); });
    photosZone.addEventListener('drop', e => {
        e.preventDefault();
        photosZone.classList.remove('border-primary', 'bg-primary/10');
        addPhotoFiles(Array.from(e.dataTransfer.files), uploadData);
    });

    photosInput.addEventListener('change', () => { addPhotoFiles(Array.from(photosInput.files), uploadData); });
}

function addPhotoFiles(files, uploadData) {
    const validFiles = files.filter(f => f.type.startsWith('image/'));
    uploadData.photos.push(...validFiles);
    $('#photoCount').textContent = `${uploadData.photos.length} selected`;
    renderPhotoGrid(uploadData);
}

function renderPhotoGrid(uploadData) {
    const grid = $('#photoPreviewGrid');
    grid.innerHTML = '';

    uploadData.photos.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'relative aspect-square rounded-lg overflow-hidden group bg-slate-100 border border-slate-200';

        const img = document.createElement('img');
        img.className = 'w-full h-full object-cover';
        img.file = file;

        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.readAsDataURL(file);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm';
        removeBtn.innerHTML = '<span class="material-icons-round text-xs block">close</span>';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            uploadData.photos.splice(index, 1);
            $('#photoCount').textContent = `${uploadData.photos.length} selected`;
            renderPhotoGrid(uploadData);
        };

        div.appendChild(img);
        div.appendChild(removeBtn);
        grid.appendChild(div);
    });
}

// -----------------------------------------------------
// Camera Logic
// -----------------------------------------------------

function setupCameraUI(uploadData) {
    $('#btnCameraVideo').addEventListener('click', () => openCamera('video', uploadData));
    $('#btnCameraPhoto').addEventListener('click', () => openCamera('photo', uploadData));
    $('#btnCameraBack').addEventListener('click', closeCamera);

    $('#btnRecordToggle').addEventListener('click', () => toggleRecording(uploadData));
    $('#btnTakePhoto').addEventListener('click', () => takePhoto(uploadData));
}

async function openCamera(mode, uploadData) {
    const constraints = {
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: mode === 'video'
    };

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        const video = $('#cameraFeed');
        video.srcObject = cameraStream;

        $('#cameraModal').classList.remove('hidden');
        $('#cameraControlsVideo').classList.add('hidden');
        $('#cameraControlsPhoto').classList.add('hidden');

        if (mode === 'video') {
            $('#cameraControlsVideo').classList.remove('hidden');
            // Reset recorder UI
            $('#recordingTimer').classList.add('hidden');
            $('#recDot').classList.remove('animate-pulse');
            $('#recTime').textContent = '00:00';
            $('#iconRecord').textContent = 'fiber_manual_record';
        } else {
            $('#cameraControlsPhoto').classList.remove('hidden');
        }
    } catch (err) {
        console.error('Camera error:', err);
        alert('Could not access camera. Please ensure permissions are granted.');
    }
}

function closeCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    $('#cameraModal').classList.add('hidden');
}

function toggleRecording(uploadData) {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        // Stop
        mediaRecorder.stop();
        $('#iconRecord').textContent = 'stop'; // Wait for stop event
    } else {
        // Start
        recordedChunks = [];
        try {
            mediaRecorder = new MediaRecorder(cameraStream);
        } catch (e) {
            console.error('MediaRecorder error:', e);
            alert('Video recording not supported on this browser/device configuration.');
            return;
        }

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            // Create a File object
            const file = new File([blob], `capture_${Date.now()}.webm`, { type: 'video/webm' });
            setVideoFile(file, uploadData);
            closeCamera();
        };

        mediaRecorder.start();

        // UI Update
        $('#iconRecord').textContent = 'stop';
        $('#recordingTimer').classList.remove('hidden');
        $('#recDot').classList.add('animate-pulse');

        let seconds = 0;
        const timer = setInterval(() => {
            if (!mediaRecorder || mediaRecorder.state !== 'recording') {
                clearInterval(timer);
                return;
            }
            seconds++;
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            $('#recTime').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }, 1000);
    }
}

function takePhoto(uploadData) {
    const video = $('#cameraFeed');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        uploadData.photos.push(file);
        $('#photoCount').textContent = `${uploadData.photos.length} selected`;
        renderPhotoGrid(uploadData);

        // Flash effect
        const flash = document.createElement('div');
        flash.className = 'fixed inset-0 bg-white z-[110] pointer-events-none transition-opacity duration-150';
        document.body.appendChild(flash);
        requestAnimationFrame(() => { flash.style.opacity = '0'; });
        setTimeout(() => flash.remove(), 150);

    }, 'image/jpeg', 0.85);
}

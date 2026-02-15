import { $, formatTimestamp } from '../utils.js';

export function initReviewSubmit(uploadData, submitCallback, backCallback) {
    const btnSubmit = $('#btnSubmitCapture');
    const btnBack = $('#btnStep3Back');

    // Button Listeners
    btnSubmit.addEventListener('click', submitCallback);
    btnBack.addEventListener('click', backCallback);

    // We can also export a function to update the UI when entering this step
    // But since `showStep` in app.js manages visibility, maybe we expose an `updateReviewUI` function
}

export function updateReviewUI(uploadData) {
    $('#reviewName').textContent = uploadData.propertyName;
    $('#reviewAddress').textContent = uploadData.propertyAddress || '—';
    $('#reviewVideo').textContent = uploadData.video
        ? `${uploadData.video.name} (${formatTimestamp(uploadData.videoMetadata?.durationSeconds)} - ${uploadData.videoMetadata?.width}x${uploadData.videoMetadata?.height})`
        : 'None';
    $('#reviewPhotos').textContent = uploadData.photos.length > 0 ? `${uploadData.photos.length} file(s)` : 'None';
}

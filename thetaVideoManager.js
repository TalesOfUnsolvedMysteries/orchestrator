const request = require('request');
const fs = require('fs');
const log = require('./log');

const presignOptions = {
  'method': 'POST',
  'url': 'https://api.thetavideoapi.com/upload',
  'headers': {
    'x-tva-sa-id': process.env.THETA_VIDEO_API_KEY,
    'x-tva-sa-secret': process.env.THETA_VIDEO_API_SECRET
  }
};

const getOptionsToUpload = (presigned_url, file) => {
  return {
    'method': 'PUT',
    'url': presigned_url,
    'headers': {
      'Content-Type': 'application/octet-stream'
    },
    body: file
  };
};

const getOptionsToTranscode = (id, title) => {
  return {
    'method': 'POST',
    'url': 'https://api.thetavideoapi.com/video',
    'headers': {
      'x-tva-sa-id': process.env.THETA_VIDEO_API_KEY,
      'x-tva-sa-secret': process.env.THETA_VIDEO_API_SECRET,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      source_upload_id: id,
      playback_policy: 'public',
      file_name: title
    })
  };
};


const uploadVideo = async (file, videoTitle, retries=0) => {
  if (!fs.existsSync(file)) {
    if (retries>5) throw new Error('file does not exist');
    log.info(`[VM] file ${ file } does not exist, wait 1 second, ${retries + 1} retry`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await uploadVideo(file, videoTitle, ++retries);
  }
  
  const video = await new Promise((resolve, reject) => {
    request(presignOptions, (error, response) => {
      if (error) return reject(error);
      const res = JSON.parse(response.body);
      log.info(res);
      resolve(res.body.uploads[0]);
    });
  });
  log.info(video);
  const { presigned_url } = video;
  log.info(presigned_url);
  const uploadOptions = getOptionsToUpload(presigned_url);
  await new Promise((resolve, reject) => {
    const r = request(uploadOptions);
    log.info(r);
    var upload = fs.createReadStream(file);
    upload.pipe(r);
    
    var upload_progress = 0;
    upload.on("data", function (chunk) {
      upload_progress += chunk.length
      log.info(new Date(), upload_progress);
    })
    
    upload.on("end", function (res) {
      log.info('Finished');
      resolve();
    });
  });
  
  // transcode video
  const transcodeOptions = getOptionsToTranscode(video.id, videoTitle);
  const processedVideo = await new Promise((resolve, reject) => {
    request(transcodeOptions, (error, response) => {
      if (error) throw new Error(error);
      const res = JSON.parse(response.body);
      resolve(res.body.videos[0]);
    });
  });
  return processedVideo;
};

module.exports = {
  uploadVideo
};


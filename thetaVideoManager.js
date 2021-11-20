require('dotenv').config();
const request = require('request');
const fs = require('fs');

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


const uploadVideo = async (file, videoTitle) => {
  const video = await new Promise((resolve, reject) => {
    request(presignOptions, (error, response) => {
      if (error) return reject(error);
      const res = JSON.parse(response.body);
      console.log(res);
      resolve(res.body.uploads[0]);
    });
  });
  console.log(video);
  const { presigned_url } = video;
  console.log(presigned_url);
  const uploadOptions = getOptionsToUpload(presigned_url);
  await new Promise((resolve, reject) => {
    const r = request(uploadOptions);
    console.log(r);
    var upload = fs.createReadStream(file);
    upload.pipe(r);
    
    var upload_progress = 0;
    upload.on("data", function (chunk) {
      upload_progress += chunk.length
      console.log(new Date(), upload_progress);
    })
    
    upload.on("end", function (res) {
      console.log('Finished');
      resolve();
    });
  });

  // transcode?
  var options = {
    'method': 'POST',
    'url': 'https://api.thetavideoapi.com/video',
    'headers': {
      'x-tva-sa-id': process.env.THETA_VIDEO_API_KEY,
      'x-tva-sa-secret': process.env.THETA_VIDEO_API_SECRET,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({"source_upload_id":video.id, "playback_policy":"public", "file_name": videoTitle})
  };
  request(options, (error, response) => {
    if (error) throw new Error(error);
    const res = JSON.parse(response.body);
    console.log(res.body.videos[0]);
  });
  
};

uploadVideo('/mnt/d/user/videos/2021-11-10 10-14-15.mkv', 'videoName');


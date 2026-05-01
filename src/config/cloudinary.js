const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadBuffer = (buffer, folder, resourceType = 'auto') =>
  new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: `apexschool/${folder}`, resource_type: resourceType },
      (err, result) => err ? reject(err) : resolve(result)
    ).end(buffer);
  });

module.exports = { cloudinary, uploadBuffer };

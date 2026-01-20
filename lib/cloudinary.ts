import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function uploadToCloudinary(
  imageUrl: string,
  folder: string = 'designs'
): Promise<{ url: string; publicId: string }> {
  try {
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder,
      resource_type: 'image',
    })
    
    return {
      url: result.secure_url,
      publicId: result.public_id,
    }
  } catch (error: any) {
    throw new Error(`Cloudinary upload failed: ${error.message}`)
  }
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  folder: string = 'designs',
  publicId?: string
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        public_id: publicId,
      },
      (error, result) => {
        if (error) reject(error)
        else if (result) {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          })
        } else {
          reject(new Error('Upload failed: no result'))
        }
      }
    )
    uploadStream.end(buffer)
  })
}

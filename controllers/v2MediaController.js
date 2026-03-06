const path = require('path');
const { createPresignedUploadUrl } = require('../utils/s3Upload');

const sanitizeFileName = (name = 'file') =>
  String(name)
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);

const folderForMediaType = (mediaType) => {
  if (mediaType === 'video') return 'bulk-sell-videos';
  if (mediaType === 'image') return 'bulk-sell-images';
  return 'bulk-sell-documents';
};

class V2MediaController {
  /**
   * POST /api/v2/media/presign-upload
   * Body: { fileName: string, contentType: string, mediaType?: 'image'|'video'|'document', userId?: number|string }
   */
  static async getPresignedUploadUrl(req, res) {
    try {
      const { fileName, contentType, mediaType = 'document', userId } = req.body || {};

      if (!fileName || !contentType) {
        return res.status(400).json({
          status: 'error',
          msg: 'fileName and contentType are required',
          data: null,
        });
      }

      const safeName = sanitizeFileName(fileName);
      const ext = path.extname(safeName || '').toLowerCase() || '';
      const folder = folderForMediaType(mediaType);
      const ownerId = userId ? String(userId) : 'anonymous';
      const s3Key = `${folder}/${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext || ''}`;

      const presigned = await createPresignedUploadUrl({
        key: s3Key,
        contentType: String(contentType),
        expiresIn: 900,
      });

      return res.json({
        status: 'success',
        msg: 'Presigned upload URL generated',
        data: {
          uploadUrl: presigned.uploadUrl,
          fileUrl: presigned.publicUrl,
          s3Key: presigned.s3Key,
          expiresIn: presigned.expiresIn,
        },
      });
    } catch (error) {
      console.error('❌ Error generating presigned upload URL:', error);
      return res.status(500).json({
        status: 'error',
        msg: error.message || 'Failed to generate presigned upload URL',
        data: null,
      });
    }
  }
}

module.exports = V2MediaController;

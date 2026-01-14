# S3 Bucket Policy for Documents Folder

## Issue
Documents uploaded to S3 are returning "Access Denied" errors when accessed via direct URL.

## Solution
The S3 bucket needs a bucket policy that allows public read access to the `documents/` folder.

## Required Bucket Policy

Add this bucket policy to your S3 bucket (`scrapmate-images`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::scrapmate-images/documents/*"
    }
  ]
}
```

## How to Apply

1. Go to AWS S3 Console
2. Select the `scrapmate-images` bucket
3. Go to "Permissions" tab
4. Scroll to "Bucket policy"
5. Click "Edit" and paste the policy above
6. Save changes

## Alternative: Use Presigned URLs

If you don't want public access, you can generate presigned URLs in the backend when serving documents. However, this requires backend changes to generate URLs on-demand.

## Current Status

- Files are uploaded correctly to S3
- Filenames are now sanitized to prevent malformed names
- Bucket policy needs to be updated to allow public read access


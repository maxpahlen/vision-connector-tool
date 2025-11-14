# Vercel Deployment Guide for PDF Extraction Service

This guide walks you through deploying the PDF extraction service to Vercel and connecting it to your Lovable Cloud backend.

## Prerequisites

- A [Vercel account](https://vercel.com/signup) (free tier works fine)
- Vercel CLI installed (optional, but recommended): `npm install -g vercel`
- OpenSSL or another tool to generate secure random strings

---

## Step 1: Generate API Key

The API key secures communication between your backend and the PDF service. Generate a strong random key:

```bash
# Using OpenSSL (macOS/Linux/WSL)
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using PowerShell (Windows)
-join ((48..57) + (65..70) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

**Save this key** - you'll need it twice:
1. As an environment variable in Vercel
2. As a secret in Lovable Cloud

Example output: `a3f8d9c2b1e7f4a8c9d2e5f8b1c4d7e9f2a5b8c1d4e7f0a3b6c9d2e5f8a1b4c7`

---

## Step 2: Prepare the Project

Navigate to the pdf-extractor directory:

```bash
cd services/pdf-extractor
```

Create a `vercel.json` configuration file:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "index.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

---

## Step 3: Deploy to Vercel

### Option A: Using Vercel CLI (Recommended)

1. **Login to Vercel:**
   ```bash
   vercel login
   ```

2. **Deploy the service:**
   ```bash
   vercel
   ```
   
   During the setup, answer the prompts:
   - Set up and deploy? **Y**
   - Which scope? Select your account
   - Link to existing project? **N**
   - What's your project's name? `pdf-extractor-service` (or your preferred name)
   - In which directory is your code located? `./` (press Enter)
   - Want to override settings? **N**

3. **Add the API key environment variable:**
   ```bash
   vercel env add PDF_EXTRACTOR_API_KEY production
   ```
   
   When prompted, paste the API key you generated in Step 1.

4. **Deploy to production:**
   ```bash
   vercel --prod
   ```

5. **Copy the deployment URL:**
   After deployment, Vercel will output a URL like:
   ```
   https://pdf-extractor-service.vercel.app
   ```
   **Save this URL** - you'll need it for Lovable Cloud.

### Option B: Using Vercel Dashboard

1. **Go to [Vercel Dashboard](https://vercel.com/dashboard)**

2. **Import the project:**
   - Click "Add New..." → "Project"
   - Import your Git repository or upload the `services/pdf-extractor` folder

3. **Configure the project:**
   - **Framework Preset:** Other
   - **Root Directory:** Leave as is (or select `services/pdf-extractor` if deploying the entire repo)
   - **Build Command:** Leave empty
   - **Output Directory:** Leave empty
   - **Install Command:** `npm install`

4. **Add environment variable:**
   - In "Environment Variables" section, add:
     - **Key:** `PDF_EXTRACTOR_API_KEY`
     - **Value:** Paste the API key from Step 1
     - **Environments:** Select "Production"

5. **Click "Deploy"**

6. **Copy the deployment URL:**
   After deployment completes, copy the URL from the dashboard:
   ```
   https://pdf-extractor-service-xyz.vercel.app
   ```

---

## Step 4: Configure Lovable Cloud Secrets

Now that your service is deployed, configure your Lovable Cloud backend to use it:

1. **Return to Lovable and add the secrets:**
   
   You'll be prompted to enter two values:
   - `PDF_EXTRACTOR_URL`: Your Vercel deployment URL (e.g., `https://pdf-extractor-service.vercel.app`)
   - `PDF_EXTRACTOR_API_KEY`: The same API key you used in Vercel

2. **Important:** Make sure the `PDF_EXTRACTOR_URL` does NOT have a trailing slash.

---

## Step 5: Test the Deployment

### Test the health endpoint:

```bash
curl https://your-vercel-url.vercel.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "pdf-extractor",
  "timestamp": "2025-01-13T10:30:00.000Z"
}
```

### Test PDF extraction:

```bash
curl -X POST https://your-vercel-url.vercel.app/extract \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY_HERE" \
  -d '{
    "pdfUrl": "https://example.com/sample.pdf"
  }'
```

Expected response:
```json
{
  "success": true,
  "text": "Extracted PDF text content...",
  "metadata": {
    "pageCount": 10,
    "textLength": 5432,
    "byteSize": 245678
  }
}
```

---

## Step 6: Verify End-to-End Integration

Test the complete pipeline through your Lovable Cloud backend:

1. **Navigate to your app's scraper test interface**
2. **Trigger a PDF document scrape**
3. **Check the backend logs** to verify the PDF service is being called successfully
4. **Verify the extracted text** is stored in your database

---

## Troubleshooting

### Deployment Issues

**Error: "Module not found"**
- Ensure all dependencies are in `package.json`
- Run `npm install` locally to verify dependencies resolve
- Redeploy with `vercel --prod`

**Error: "Function exceeded timeout"**
- Large PDFs may take longer to process
- Consider upgrading your Vercel plan for longer timeouts
- Or implement a job queue system for large PDFs

### API Key Issues

**Error: "Invalid API key"**
- Verify the API key in Vercel matches the one in Lovable Cloud
- Check for trailing spaces or newlines in the key
- Regenerate the key and update both services if needed

**Error: "Missing x-api-key header"**
- Ensure your edge function is sending the header correctly:
  ```typescript
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': pdfExtractorApiKey
  }
  ```

### Connection Issues

**Error: "Failed to fetch"**
- Verify the `PDF_EXTRACTOR_URL` in Lovable Cloud is correct
- Ensure the URL does NOT have a trailing slash
- Check Vercel deployment status in the dashboard
- Verify the function is deployed to production (not preview)

---

## Monitoring and Logs

### View Vercel logs:

**Via CLI:**
```bash
vercel logs pdf-extractor-service --prod
```

**Via Dashboard:**
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Click "Logs" tab
4. Filter by production environment

### Monitor usage:

Check your Vercel dashboard for:
- Request count
- Bandwidth usage
- Error rates
- Function execution time

---

## Updating the Service

When you make changes to the PDF extraction service:

1. **Update the code locally**
2. **Test locally:**
   ```bash
   npm install
   npm start
   # Test at http://localhost:3000
   ```

3. **Deploy the update:**
   ```bash
   vercel --prod
   ```

The URL remains the same, so no changes needed in Lovable Cloud.

---

## Security Best Practices

1. **Rotate API keys regularly** (every 90 days recommended)
2. **Monitor for unusual traffic patterns** in Vercel dashboard
3. **Enable Vercel's DDoS protection** (available in project settings)
4. **Use environment variables** for all sensitive data - never hardcode secrets
5. **Implement rate limiting** if you experience abuse (see `index.js`)

---

## Cost Optimization

**Free Tier Limits (Vercel Hobby):**
- 100GB bandwidth/month
- 100GB-Hrs serverless function execution
- 1000 serverless function invocations per day

**Tips to stay within free tier:**
- Cache frequently accessed PDFs
- Implement request throttling
- Monitor usage in Vercel dashboard
- Consider upgrading to Pro if you exceed limits

---

## Need Help?

- **Vercel Documentation:** https://vercel.com/docs
- **Lovable Documentation:** https://docs.lovable.dev
- **Lovable Discord:** https://discord.gg/lovable

---

## Summary Checklist

- [ ] Generate API key with `openssl rand -hex 32`
- [ ] Create `vercel.json` configuration
- [ ] Deploy to Vercel (CLI or Dashboard)
- [ ] Add `PDF_EXTRACTOR_API_KEY` environment variable in Vercel
- [ ] Copy deployment URL
- [ ] Add `PDF_EXTRACTOR_URL` and `PDF_EXTRACTOR_API_KEY` secrets in Lovable Cloud
- [ ] Test health endpoint
- [ ] Test PDF extraction endpoint
- [ ] Verify end-to-end integration through your app
- [ ] Monitor logs and usage

Your PDF extraction service is now live and integrated! 🎉

# Mega Monsters Setup Guide

## Overview
The Mega Monsters system allows admins to create, generate, and manage AI-generated mega monster images. This system is similar to the Ascended Queue system but specifically for mega monster creations.

## Database Setup

### 1. Run the Migration
Execute the SQL migration to create the `mega_monsters` table:

```bash
# Using psql
psql $DATABASE_URL < scripts/create-mega-monsters-table.sql

# Or using your database client
# Copy and run the SQL from: scripts/create-mega-monsters-table.sql
```

### Table Schema
```sql
mega_monsters (
  id UUID PRIMARY KEY,
  wallet_address TEXT,          -- Optional wallet address
  inscription_id TEXT,           -- Folder/inscription ID
  commit_txid TEXT,              -- Commit transaction ID
  broadcast_txid TEXT,           -- Broadcast transaction ID
  prompt TEXT NOT NULL,          -- AI generation prompt (required)
  image_data TEXT,               -- Base64 image data
  image_blob_url TEXT,           -- Vercel Blob storage URL
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

## Features

### Admin Page: `/admin/megamonsters`
Access via the link on `/sadmin`

#### Create New Mega Monster
1. Click "Create New Mega Monster"
2. Fill in the prompt (required)
3. Optionally fill in wallet address, inscription ID, commit/broadcast TXIDs
4. Click "Create"
5. The record is created without an image initially

#### Generate Image
For records without images:
1. Click the green lightning bolt icon (⚡)
2. The system generates an image using OpenAI's DALL-E
3. Image is uploaded to Vercel Blob storage
4. Both base64 and blob URL are saved

#### Edit Details
1. Click the blue edit icon (✏️)
2. Modify any fields (prompt, wallet, inscription ID, etc.)
3. Click save (checkmark icon)

#### Regenerate Image
For records with existing images:
1. Click the purple sparkles icon (✨)
2. A comparison modal appears showing:
   - Original image (left)
   - Regenerated image (right)
3. Choose which version to keep:
   - "Keep Original" - closes modal without changes
   - "Use Regenerated" - replaces the original with the new version

#### Delete Record
1. Click the red trash icon (🗑️)
2. Confirm deletion
3. Record is permanently removed

#### Pagination
- Shows 10 records per page
- Use chevron buttons to navigate pages
- Total count displayed at top

## API Endpoints

### GET `/api/admin/megamonsters`
List all mega monsters with pagination
- Query params: `page`, `limit`
- Returns: `{ success, records, total, page, limit }`

### POST `/api/admin/megamonsters`
Create new mega monster record
- Body: `{ wallet_address?, inscription_id?, commit_txid?, broadcast_txid?, prompt }`
- Returns: `{ success, record }`

### PATCH `/api/admin/megamonsters/[id]`
Update mega monster record
- Body: Any combination of fields to update
- Returns: `{ success, record }`

### DELETE `/api/admin/megamonsters/[id]`
Delete mega monster record
- Returns: `{ success, message }`

### POST `/api/admin/megamonsters/[id]/generate`
Generate image for existing record
- Uses the record's prompt
- Saves image_data and image_blob_url
- Returns: `{ success, record, imageUrl, imageBlobUrl }`

### POST `/api/admin/megamonsters/[id]/regenerate`
Regenerate image (for comparison)
- Body: `{ prompt }`
- Does NOT save automatically
- Returns: `{ success, regeneratedImageUrl, regeneratedImageBlobUrl }`

## Image Generation

### OpenAI Integration
- Model: `gpt-image-1` (DALL-E)
- Size: `1024x1024`
- Requires: `OPENAI_API_KEY` environment variable

### Storage
- Images are uploaded to Vercel Blob storage
- Folder: `mega-monsters/`
- Naming: `mega-{timestamp}.png` (generate) or `regen-{timestamp}.png` (regenerate)
- Fallback: Base64 data URL if blob upload fails

## UI Features

### Color Scheme
- Primary: Cyan/Teal theme
- Borders: Cyan glows
- Buttons: 
  - Create/Save: Cyan
  - Generate: Green (lightning)
  - Regenerate: Purple (sparkles)
  - Edit: Blue
  - Delete: Red

### Responsive Design
- Mobile-friendly grid layout
- Image cards with 200x200 thumbnails
- Collapsible create form
- Modal for regenerate comparison

### States
- Loading: Spinner animations
- Generating: Per-record loading state
- Editing: Inline edit forms
- Empty: Helpful empty state message

## Access

### Link on Super Admin Page
- Path: `/sadmin` → "Mega Monster Creation"
- Icon: ⚡ Zap
- Color: Cyan theme
- Description: "Generate and manage mega monster images with AI"

## Workflow Example

1. **Create a record**:
   - Go to `/admin/megamonsters`
   - Click "Create New Mega Monster"
   - Enter prompt: "A fearsome mega monster with three heads, glowing red eyes, and massive wings"
   - Leave other fields blank for now
   - Click "Create"

2. **Generate the image**:
   - Find the new record in the list (no image yet)
   - Click the green lightning bolt icon (⚡)
   - Wait for generation (~10-30 seconds)
   - Image appears in the record

3. **Refine if needed**:
   - Click the purple sparkles icon (✨) to regenerate
   - Compare original vs regenerated
   - Choose which to keep

4. **Add transaction details later**:
   - Click edit icon (✏️)
   - Fill in inscription_id, commit_txid, broadcast_txid
   - Click save (✓)

## Notes

- Wallet address is optional for now (can be filled in later)
- Prompt is the only required field when creating
- Images are generated on-demand, not automatically on creation
- Regeneration creates a temporary image for comparison
- Only when "Use Regenerated" is clicked does the database update
- Each generation costs OpenAI credits
- Maximum request duration: 180 seconds (for image generation)

## Future Enhancements

Potential features to add:
- Batch generation
- Prompt templates
- Image variations
- Download images as ZIP
- Link to blockchain transactions
- Wallet association lookup
- Generation history/audit log
- Cost tracking per generation


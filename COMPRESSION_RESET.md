# Reset Image Compression

Quick guide to reset compression flags for recompressing images.

## API Endpoint

`GET or POST /api/graveyard/mint/reset-compression`

## Usage Examples

### 1. Reset ALL compressed images

**Easiest - Just visit in browser:**
```
http://localhost:3000/api/graveyard/mint/reset-compression
```

Or in browser console:
```javascript
fetch('/api/graveyard/mint/reset-compression')
  .then(r => r.json())
  .then(console.log)
```

### 2. Reset specific mint queue item by ID

**In browser:**
```
http://localhost:3000/api/graveyard/mint/reset-compression?mintQueueId=YOUR_MINT_QUEUE_ID
```

### 3. Reset by inscription ID

**In browser:**
```
http://localhost:3000/api/graveyard/mint/reset-compression?inscriptionId=abc123i0
```

## Response

```json
{
  "success": true,
  "message": "Reset compression for ALL items",
  "count": 5,
  "items": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "source_inscription_id": "abc123i0"
    },
    // ... more items
  ]
}
```

## What It Does

Simply sets `is_compressed` → `false` (keeps existing compressed URLs intact).

Next time you visit the graveyard page, the images will be recompressed with the current settings (640x640, 80% quality).


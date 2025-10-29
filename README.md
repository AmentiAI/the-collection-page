# The Damned - Ordinals Collection

A high-quality horror-themed Next.js collection site for Bitcoin Ordinals featuring "The Damned" collection.

## Features

- **Animated Blood Drips**: CSS canvas animation with blood drops continuously dripping down the screen
- **Advanced Filtering**: Filter by every trait option across all categories (Eyes, Head, Mouth, Body Skin, Background, Props)
- **Collapsible Filter Categories**: Organize your filters with expandable/collapsible sections
- **Full Collection View**: Browse all ordinals in a responsive grid layout
- **Modal Detail View**: Click any ordinal to see full details and high-resolution image
- **Horror Theme**: Dark, gothic design with blood-red accents and eerie effects
- **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices

## Tech Stack

- **Next.js 14** (App Router)
- **React 18**
- **TypeScript**
- **Tailwind CSS**
- **Canvas API** for blood drip animations

## Getting Started

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
the-collection-page/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Homepage with collection
│   └── globals.css         # Global styles
├── components/
│   ├── BloodCanvas.tsx     # Animated blood drip background
│   ├── Header.tsx         # Site header
│   ├── Filters.tsx         # Filter sidebar
│   ├── Gallery.tsx         # Ordinal grid gallery
│   └── Modal.tsx          # Detail modal
├── types/
│   └── index.ts           # TypeScript interfaces
└── public/
    ├── generated_ordinals.json
    ├── traits.json
    └── trait_categories.json
```

## Features Explained

### Blood Drip Animation
The `BloodCanvas` component creates an animated canvas backdrop with 15 blood drops continuously falling from the top of the screen, creating a chilling atmosphere.

### Advanced Filtering
- Select any combination of traits from each category
- Categories are collapsible for better organization
- See active filter counts
- "Clear All" button to reset filters instantly
- Real-time filtering as you select options

### Responsive Gallery
- Automatically adjusts grid columns based on screen size
- Mobile: 1 column
- Tablet: 2 columns
- Desktop: 3-4 columns

### Modal View
Click any ordinal card to view:
- Full resolution image
- All trait categories with names and descriptions
- Clean, organized layout
- Click outside or X button to close

## Styling

The site uses a horror theme with:
- Dark background (#0a0a0a)
- Blood red accents (#ff0000, #8B0000)
- Gothic "Cinzel" font
- Glowing text effects
- Custom scrollbars
- Smooth animations and transitions

## Customization

Edit `tailwind.config.ts` to modify colors and theme:

```typescript
colors: {
  'blood-red': '#8B0000',
  'dark-blood': '#ff0000',
}
```

## License

MIT
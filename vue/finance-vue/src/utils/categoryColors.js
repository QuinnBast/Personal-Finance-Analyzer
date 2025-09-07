export const categoryColors = {
    "Food": "rgb(143, 188, 143)",           // Sage green
    "Entertainment": "rgb(230, 130, 130)",  // Muted coral red
    "Vehicle": "rgb(100, 125, 150)",        // Slate blue-gray
    "Personal": "rgb(180, 140, 200)",       // Soft mauve
    "Bills": "rgb(240, 210, 90)",           // Warm muted yellow
    "Job": "rgb(100, 150, 230)",            // Muted sky blue
    "Work": "rgb(80, 120, 190)",            // Steely blue
    "Power": "rgb(245, 160, 90)",           // Peachy orange
    "Investment": "rgb(85, 107, 47)",       // Dark olive green
    "Misc": "rgb(160, 160, 160)",           // Neutral gray
    "Internet": "rgb(140, 200, 240)",       // Light azure
    "Gifts": "rgb(250, 200, 80)",           // Gold-orange
    "Video Games": "rgb(170, 120, 210)",    // Violet
    "Health": "rgb(102, 205, 170)",         // Soft teal
    "Education": "rgb(152, 251, 152)",      // Pale green
    "Vacation": "rgb(255, 190, 110)",       // Sunset orange
    "Home": "rgb(200, 180, 150)",           // Warm beige
    "Electronics": "rgb(130, 220, 230)",    // Pale cyan
    "Phone": "rgb(130, 170, 230)",          // Cornflower blue
    "Rent": "rgb(160, 100, 180)",           // Royal purple
    "Business": "rgb(110, 140, 180)",       // Blue-gray
    "Web Hosting": "rgb(100, 200, 240)",    // Icy blue
    "Lottery": "rgb(240, 140, 180)",        // Dusty rose
    "Insurance": "rgb(210, 90, 90)",        // Soft crimson
};

const fallbackColors = {};

export const rgbToRgba = (rgb, alpha = 0.5) => {
    const [r, g, b] = rgb.match(/\d+/g);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const getCategoryColor = (category, alpha) => {
    if (categoryColors[category]) {
        return categoryColors[category];
    }

    if (!fallbackColors[category]) {
        fallbackColors[category] = generateSoftColor();
    }

    return fallbackColors[category];
};

const generateSoftColor = () => {
    const hue = Math.floor(Math.random() * 360);
    const saturation = 50 + Math.random() * 10; // 50–60%
    const lightness = 70 + Math.random() * 10;  // 70–80%
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

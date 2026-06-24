import './style.css';
import { initNav } from './ui.js';
import { initClimateModel } from './climate-model.js';

// Unterseite: Navigation + interaktives Klimamodell
initNav();
initClimateModel(document.getElementById('klimamodell-widget'));

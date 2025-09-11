# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Korean high school grade analysis web application that processes NEIS (교육행정정보시스템) XLS data files to analyze student academic performance. The application runs entirely client-side for privacy and security.

## Architecture

### Core Components

- **Frontend**: Single-page application with vanilla HTML/CSS/JavaScript
- **Main Class**: `ScoreAnalyzer` (script.js) - handles all data processing and UI interactions
- **Data Processing**: Client-side Excel file parsing using SheetJS (xlsx library)
- **Visualization**: Chart.js for grade distribution charts and analytics
- **Export**: Supports PDF generation (jsPDF, html2canvas) and CSV export

### Key Features

1. **File Upload**: Drag-and-drop or click-to-upload multiple NEIS XLS/XLSX files
2. **Grade Analysis**: 
   - Subject-wise analysis with averages and distributions
   - Grade conversion between 5-grade and 9-grade systems
   - Student performance analytics with scatter plots and bar charts
3. **Export Options**:
   - Individual student PDF reports
   - Bulk class PDF generation
   - CSV data export for external analysis

### File Structure

- `index.html` - Main UI structure with upload interface and analysis tabs
- `script.js` - Core application logic (3000+ lines)
  - ScoreAnalyzer class with methods:
    - `analyzeFiles()` - processes uploaded Excel files
    - `displayResults()` - renders analysis results
    - `exportToCSV()` - generates consolidated data export
    - `convertTo9Grade()` - converts 5-grade to 9-grade system
- `style.css` - Complete styling with responsive design

## External Dependencies

The application uses these CDN-loaded libraries:
- **SheetJS (xlsx)**: Excel file parsing
- **Chart.js**: Data visualization and charts
- **JSZip**: File compression for exports
- **jsPDF**: PDF generation
- **html2canvas**: HTML-to-canvas conversion for PDF exports

## Development Notes

### Data Privacy
The application is designed for maximum privacy - all data processing occurs client-side with no server communication. Files are never uploaded to external servers.

### Grade System
The application handles Korean educational grade systems:
- 5-grade system (standard): 1등급 (best) to 5등급 (lowest)
- 9-grade system conversion for university applications

### Korean Language Support
UI text and data exports are in Korean. CSV exports include BOM for proper Korean character encoding.

## No Build Process

This is a static web application with no build step required. Simply open `index.html` in a web browser or serve via any static web server.

## Testing

The application is designed for manual testing with actual NEIS XLS files. Test by:
1. Loading the application in a browser
2. Uploading sample XLS data files from NEIS
3. Verifying analysis results and export functionality
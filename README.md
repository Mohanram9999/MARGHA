# MARGHA
Agent
# 🧭 MARGHA — Your Smart Travel Companion

**Discover places. Find your way. Enjoy the journey.**

🌐 **Live Demo:** https://margha.onrender.com

MARGHA is an AI-powered travel companion that brings local discovery, travel assistance, and useful location-based information into one convenient interface. From discovering restaurants and hotels to finding hospitals, shopping malls, and famous places, MARGHA helps users explore their surroundings more easily.

## 🚀 The Problem

Travelers often need to switch between multiple applications to find restaurants, accommodation, hospitals, shopping destinations, tourist attractions, and other essential services. This can make exploring unfamiliar places inconvenient.

## 💡 Our Solution

MARGHA combines search-powered discovery, AI assistance, user authentication, and category-based carousels in one application. Users can explore different types of places and access travel-related assistance through a unified interface.

## ✨ Key Features

### 🎠 Explore Places with Carousels

Browse visually organized, scrollable carousels for different categories:

- 🍽️ Restaurants
- 🏨 Hotels
- 🏛️ Famous Places and Tourist Attractions
- 🛍️ Shopping Malls
- 🏥 Hospitals and Healthcare Facilities

The carousel interface makes it easier to browse places by category and discover relevant destinations.

### 🔐 Login and Registration

- Create a user account through registration.
- Log in using an existing account.
- Supabase supports authentication and related backend functionality as implemented.

### 🤖 AI Travel Assistant

Ask travel-related questions through a conversational interface, with Groq supporting the AI workflows implemented in the application.

### 🔎 SerpApi-Powered Search

SerpApi provides structured search results from supported search engines to support place discovery and travel-related information retrieval.

### 📍 Everyday Travel Assistance

Quick-access features help users look for:

- Food options
- Restrooms
- ATMs
- Pharmacies and clinics
- Directions back to a destination
- Local events and activities
- Help and safety information

### 🌐 Unified User Experience

MARGHA brings search, conversational assistance, authentication, and category-based place discovery together in one travel companion.

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| React | Interactive frontend and user interface |
| SerpApi | Search-powered information and place discovery |
| Groq | AI inference for supported conversational workflows |
| Supabase | Authentication and backend services |
| Render | Application hosting and deployment |
| Claude | AI-assisted development |
| ChatGPT | AI-assisted development, debugging, and ideation |

## ⚙️ How It Works

1. Users open MARGHA and explore the available features.
2. Registered users can log in to access the account functionality provided by the application.
3. Users browse restaurants, hotels, famous places, shopping malls, and hospitals through carousels.
4. Supported search workflows use SerpApi to retrieve relevant information.
5. Groq supports AI-powered conversational workflows.
6. Supabase provides the configured authentication and backend services.
7. Render hosts the deployed application.

## 🏗️ System Architecture

```text
             User
               |
               v
       MARGHA React App
               |
               v
      Application Backend
         /     |      \
        v      v       v
    SerpApi   Groq   Supabase
     Search    AI    Auth/Data
        \      |       /
         \     |      /
               v
        Travel Discovery
        and Assistance

        Render: Hosting
```

*The architecture is a high-level representation. Adjust it if your deployed application uses a different request flow.*

## 🔐 Security and Privacy

- Store API keys and secret credentials in environment variables.
- Never commit private API keys to a public repository.
- Protect backend routes and configure Supabase access policies appropriately.
- Validate external API requests and handle failures safely.
- Request location information only when required for a feature.

## 🌱 Future Scope

- Personalized travel recommendations
- Multilingual travel assistance
- Improved multi-stop travel planning
- Enhanced local-event discovery
- Saved places and travel preferences
- Accessibility-focused travel support
- Improved handling of location-based information

## 🎯 Hackathon Submission

- **Hackathon:** SerpApi India Hackathon 2026
- **Project:** MARGHA
- **Category:** AI-Powered Travel Assistance and Local Discovery
- **Live Demo:** https://margha.onrender.com

**Our goal:** Make travel discovery simpler by combining search-powered information, AI assistance, and an intuitive interface.

## 👥 Team MARGHA

### Team Lead

**Koppisetti Mohan Ram Sashank**

Email: koppisettimohanramsashank9999@gmail.com

### Team Member

**Aditya Mala Kondayya Swamy**

Email: adityathesun27012007@gmail.com

## 🙌 Acknowledgements

We acknowledge SerpApi for search infrastructure, Groq for AI inference, Supabase for backend services, and Render for hosting and deployment. Claude and ChatGPT were used as AI-assisted development tools.

## ▶️ Try MARGHA

**Live Demo:** https://margha.onrender.com

Explore the application and try the features available in the deployed version.

---

**MARGHA — Your Smart Travel Companion.**

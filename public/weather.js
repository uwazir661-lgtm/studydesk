// ---------- Weather ----------
const cityInput = document.getElementById("cityInput");
const weatherBtn = document.getElementById("weatherBtn");
const weatherResult = document.getElementById("weatherResult");

// Turn the weather code into an emoji and a short description
function describeWeather(code) {
  if (code === 0) return ["☀️", "Clear sky"];
  if (code <= 3) return ["⛅", "Partly cloudy"];
  if (code === 45 || code === 48) return ["🌫️", "Fog"];
  if (code >= 51 && code <= 57) return ["🌦️", "Light drizzle"];
  if (code >= 61 && code <= 67) return ["🌧️", "Rain"];
  if (code >= 71 && code <= 77) return ["❄️", "Snow"];
  if (code >= 80 && code <= 82) return ["🌧️", "Rain showers"];
  if (code >= 95) return ["⛈️", "Thunderstorm"];
  return ["🌡️", "Weather"];
}

// Small helper that makes one box (label and value)
function makeBox(label, value) {
  const box = document.createElement("div");
  box.className = "weather-box";

  const l = document.createElement("div");
  l.className = "weather-label";
  l.textContent = label;

  const v = document.createElement("div");
  v.className = "weather-value";
  v.textContent = value;

  box.appendChild(l);
  box.appendChild(v);
  return box;
}

async function getWeather(city) {
  city = city.trim();

  if (city === "") {
    return;
  }

  weatherResult.textContent = "Searching...";

  try {
    // First API call: find the city's location (latitude, longitude)
    const geoRes = await fetch(
      "https://geocoding-api.open-meteo.com/v1/search?name=" +
        encodeURIComponent(city) +
        "&count=1"
    );
    const geoData = await geoRes.json();

    if (!geoData.results || geoData.results.length === 0) {
      weatherResult.textContent = "City not found. Check the spelling.";
      return;
    }

    const place = geoData.results[0];

    // Second API call: get the weather for that location
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=" +
      place.latitude +
      "&longitude=" +
      place.longitude +
      "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code";

    const wRes = await fetch(url);
    const wData = await wRes.json();
    const c = wData.current;

    const info = describeWeather(c.weather_code);
    const weatherSnapshot = {
      city: place.name + (place.country ? ", " + place.country : ""),
      icon: info[0],
      temperature: Math.round(c.temperature_2m),
      description: info[1],
      savedAt: Date.now()
    };

    // Build the card and show it on screen
    weatherResult.innerHTML = "";

    const card = document.createElement("div");
    card.className = "weather-card";

    const title = document.createElement("div");
    title.className = "weather-city";
    title.textContent = place.name + (place.country ? ", " + place.country : "");

    const icon = document.createElement("div");
    icon.className = "weather-icon";
    icon.textContent = info[0];

    const temp = document.createElement("div");
    temp.className = "weather-temp";
    temp.textContent = Math.round(c.temperature_2m) + "°C";

    const desc = document.createElement("div");
    desc.className = "weather-desc";
    desc.textContent = info[1];

    const grid = document.createElement("div");
    grid.className = "weather-grid";
    grid.appendChild(makeBox("Feels like", Math.round(c.apparent_temperature) + "°C"));
    grid.appendChild(makeBox("Humidity", c.relative_humidity_2m + "%"));
    grid.appendChild(makeBox("Wind", c.wind_speed_10m + " km/h"));

    card.appendChild(title);
    card.appendChild(icon);
    card.appendChild(temp);
    card.appendChild(desc);
    card.appendChild(grid);
    weatherResult.appendChild(card);

    // Remember the city so it shows up next time
    try {
      localStorage.setItem("studydesk-city", city);
      localStorage.setItem("studydesk-weather-snapshot", JSON.stringify(weatherSnapshot));
    } catch (e) {}
    window.dispatchEvent(new CustomEvent("studydesk-weather-updated", { detail: weatherSnapshot }));
  } catch (err) {
    weatherResult.textContent = "Could not load the weather. Check your internet.";
  }
}

weatherBtn.addEventListener("click", function () {
  getWeather(cityInput.value);
});

cityInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    getWeather(cityInput.value);
  }
});

// Show the last searched city when the page opens
try {
  const savedCity = localStorage.getItem("studydesk-city");
  if (savedCity) {
    cityInput.value = savedCity;
    getWeather(savedCity);
  }
} catch (e) {}

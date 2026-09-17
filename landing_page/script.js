(function () {
  "use strict";

  // Mobile menu toggle
  var navToggle = document.getElementById("navToggle");
  var mobileMenu = document.getElementById("mobileMenu");
  if (navToggle && mobileMenu) {
    navToggle.addEventListener("click", function () {
      var isOpen = mobileMenu.style.display === "block";
      mobileMenu.style.display = isOpen ? "none" : "block";
    });
    mobileMenu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        mobileMenu.style.display = "none";
      });
    });
  }

  // Scroll reveal animation
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  // Contact form -> mailto submission (no backend API)
  var CONTACT_EMAIL = "hello@vidyalaya.app";
  var form = document.getElementById("contactForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var name = (form.querySelector("#cf-name") || {}).value || "";
      var email = (form.querySelector("#cf-email") || {}).value || "";
      var phone = (form.querySelector("#cf-phone") || {}).value || "";
      var school = (form.querySelector("#cf-school") || {}).value || "";
      var message = (form.querySelector("#cf-message") || {}).value || "";

      var subject = "Vidyalaya inquiry from " + name;
      var bodyLines = [
        "Name: " + name,
        "Email: " + email,
        phone ? "Phone: " + phone : null,
        school ? "School: " + school : null,
        "",
        "Message:",
        message,
      ].filter(function (line) {
        return line !== null;
      });

      var mailto =
        "mailto:" +
        CONTACT_EMAIL +
        "?subject=" +
        encodeURIComponent(subject) +
        "&body=" +
        encodeURIComponent(bodyLines.join("\n"));

      window.location.href = mailto;
    });
  }

  // Footer year
  var yearEl = document.getElementById("footerYear");
  if (yearEl) {
    yearEl.textContent = "© " + new Date().getFullYear() + " Vidyalaya. All rights reserved.";
  }
})();

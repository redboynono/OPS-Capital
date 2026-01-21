'use strict';

(() => {
    const params = new URLSearchParams(window.location.search);
    const apiBaseParam = params.get('apiBase');

    if (apiBaseParam) {
        localStorage.setItem('OPS_API_BASE', apiBaseParam);
    }

    const storedBase = localStorage.getItem('OPS_API_BASE');
    if (storedBase) {
        window.OPS_API_BASE = storedBase;
    }
})();

'use strict';

// Pure calculation helpers for U-Tech, Plus, Yui-Tech and G-Flow.
// Units: temperature ℃, relative humidity %, pressure hPa, density g/m³, VPD kPa.
// No coercion, validation or rounding here: each caller keeps its existing policy.
// PHP and U-Tech Next deliberately remain independent of this module.
window.UTechMoisture = (() => {
    function saturationPressure(temp) {
        return 6.1078 * Math.pow(10, (7.5 * temp) / (237.3 + temp));
    }
    function vaporDensity(temp, hum) {
        const es = saturationPressure(temp);
        const ea = es * hum / 100;
        return 216.7 * (ea / (temp + 273.15));
    }
    // Preserve G-Flow's multiplication/division order, including floating-point results.
    function saturatedDensity(temp, es = saturationPressure(temp)) {
        return 216.7 * es / (temp + 273.15);
    }
    function densityDeficit(temp, hum) {
        return vaporDensity(temp, 100) - vaporDensity(temp, hum);
    }
    function pressureDeficit(temp, hum, es = saturationPressure(temp)) {
        return es * (1 - hum / 100) / 10;
    }
    function dewPoint(temp, hum) {
        const a = 17.27;
        const b = 237.7;
        const alpha = ((a * temp) / (b + temp)) + Math.log(hum / 100);
        return (b * alpha) / (a - alpha);
    }
    return Object.freeze({saturationPressure, vaporDensity, saturatedDensity, densityDeficit, pressureDeficit, dewPoint});
})();

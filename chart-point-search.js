'use strict';

// Raw {x, y} point searches for the main U-Tech and Plus charts.
// Keep numeric conversion, first-in-array tie breaking and unlimited distance.
window.UTechChartPoints = (() => {
    function isValid(point){
        if(!point || point.x === null || point.x === undefined) return false;
        if(point.y === null || point.y === undefined) return false;
        return Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
    }

    function nearestIndex(data, xValue){
        if(!data || !data.length) return -1;

        let nearestIndex = -1;
        let nearestDiff = Infinity;
        data.forEach((point, index)=>{
            if(!isValid(point)) return;
            const diff = Math.abs(Number(point.x) - Number(xValue));
            if(diff < nearestDiff){
                nearestDiff = diff;
                nearestIndex = index;
            }
        });
        return nearestIndex;
    }

    return { isValid, nearestIndex };
})();

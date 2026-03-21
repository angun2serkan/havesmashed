import React, { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { DateEntry, FriendDate } from '../../types';
import { colors } from '../../constants/colors';

interface GlobeWebViewProps {
  dates: DateEntry[];
  friendDates: FriendDate[];
  filter: 'mine' | 'all' | string;
  onCityPress: (cityId: number) => void;
  onDatePress?: (dateId: string, isFriend: boolean) => void;
}

interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  color: string;
  cityId: number;
  cityName: string;
  count: number;
  isFriend: boolean;
}

function buildPoints(
  dates: DateEntry[],
  friendDates: FriendDate[],
  filter: string,
): MapPoint[] {
  const cityMap = new Map<
    number,
    { lat: number; lng: number; color: string; cityName: string; count: number; id: string; isFriend: boolean }
  >();

  // User dates
  if (filter === 'mine' || filter === 'all') {
    for (const d of dates) {
      if (d.latitude == null || d.longitude == null) continue;
      const existing = cityMap.get(d.cityId);
      if (existing) {
        existing.count += 1;
      } else {
        cityMap.set(d.cityId, {
          lat: d.latitude,
          lng: d.longitude,
          color: '#ff2d78',
          cityName: d.cityName || 'Unknown',
          count: 1,
          id: d.id,
          isFriend: false,
        });
      }
    }
  }

  // Friend dates
  if (filter !== 'mine') {
    for (const fd of friendDates) {
      if (fd.latitude == null || fd.longitude == null) continue;
      const key = fd.cityId + 100000; // offset to separate from user cities
      const existing = cityMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        cityMap.set(key, {
          lat: fd.latitude,
          lng: fd.longitude,
          color: fd.color || '#00d4ff',
          cityName: fd.cityName || 'Unknown',
          count: 1,
          id: fd.id,
          isFriend: true,
        });
      }
    }
  }

  return Array.from(cityMap.entries()).map(([cityId, data]) => ({
    id: data.id,
    lat: data.lat,
    lng: data.lng,
    color: data.color,
    cityId: cityId > 100000 ? cityId - 100000 : cityId,
    cityName: data.cityName,
    count: data.count,
    isFriend: data.isFriend,
  }));
}

function generateMapHTML(points: MapPoint[]): string {
  const pointsJSON = JSON.stringify(points);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0f; touch-action: pan-x pan-y; }
    svg { width: 100%; height: 100%; }
    .dot { cursor: pointer; }
    .dot:active { opacity: 0.7; }
    .glow { filter: url(#neonGlow); }
    .tooltip {
      position: absolute;
      background: rgba(18, 18, 26, 0.95);
      border: 1px solid rgba(255, 45, 120, 0.3);
      border-radius: 8px;
      padding: 6px 10px;
      color: #fff;
      font-size: 11px;
      font-family: -apple-system, sans-serif;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 100;
      white-space: nowrap;
    }
    .tooltip.visible { opacity: 1; }
  </style>
</head>
<body>
  <div id="tooltip" class="tooltip"></div>
  <svg id="map" viewBox="-20 -10 380 210" preserveAspectRatio="xMidYMid meet">
    <defs>
      <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
      <filter id="dotGlow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>

    <!-- Simplified world map paths -->
    <g id="continents" fill="#1e1e2e" stroke="#2a2a3e" stroke-width="0.3">
      <!-- North America -->
      <path d="M30,25 L35,20 L50,18 L60,15 L75,18 L85,20 L95,25 L100,30 L95,40 L90,50 L85,55 L80,60 L75,65 L70,70 L65,68 L55,72 L50,75 L45,70 L40,65 L30,60 L25,50 L20,40 L25,30 Z"/>
      <!-- Greenland -->
      <path d="M90,5 L100,3 L110,5 L115,10 L110,18 L100,20 L92,17 L88,12 Z"/>
      <!-- South America -->
      <path d="M75,80 L80,75 L90,78 L95,85 L100,95 L98,105 L95,115 L92,125 L88,135 L82,145 L78,150 L75,148 L72,140 L68,130 L65,120 L63,110 L65,100 L68,90 L72,85 Z"/>
      <!-- Europe -->
      <path d="M155,20 L160,15 L170,12 L180,15 L190,18 L195,22 L192,28 L188,35 L182,38 L175,40 L168,38 L162,35 L155,32 L152,28 Z"/>
      <!-- UK -->
      <path d="M148,20 L152,17 L155,20 L153,25 L149,24 Z"/>
      <!-- Africa -->
      <path d="M155,50 L165,48 L175,50 L185,52 L195,55 L200,60 L205,70 L208,80 L205,95 L200,105 L195,115 L190,125 L185,130 L178,132 L170,130 L165,125 L160,115 L155,105 L152,95 L150,85 L148,75 L150,65 L152,55 Z"/>
      <!-- Asia -->
      <path d="M195,15 L210,10 L225,8 L240,10 L255,12 L270,15 L285,18 L295,22 L305,25 L310,30 L308,38 L300,42 L290,45 L280,48 L270,50 L260,52 L250,50 L240,48 L230,45 L220,42 L210,40 L200,38 L195,32 L192,25 Z"/>
      <!-- India -->
      <path d="M240,55 L250,52 L258,55 L262,62 L260,70 L255,78 L248,82 L242,78 L238,70 L236,62 Z"/>
      <!-- Southeast Asia -->
      <path d="M270,55 L280,52 L290,55 L300,58 L305,65 L300,70 L290,72 L280,70 L272,65 L268,60 Z"/>
      <!-- Japan -->
      <path d="M305,25 L310,22 L315,25 L312,32 L308,35 L305,30 Z"/>
      <!-- Australia -->
      <path d="M280,110 L295,105 L310,108 L320,112 L325,120 L322,130 L315,138 L305,142 L295,140 L285,135 L278,128 L275,120 L278,115 Z"/>
      <!-- New Zealand -->
      <path d="M330,135 L335,132 L338,138 L335,145 L330,142 Z"/>
      <!-- Middle East -->
      <path d="M195,40 L205,38 L215,42 L220,48 L218,55 L210,58 L202,55 L198,48 Z"/>
      <!-- Madagascar -->
      <path d="M210,118 L215,115 L218,120 L216,128 L212,130 L208,125 Z"/>
      <!-- Iceland -->
      <path d="M130,8 L138,5 L145,8 L142,13 L135,14 L130,12 Z"/>
      <!-- Indonesia -->
      <path d="M275,78 L285,75 L295,78 L305,80 L310,85 L305,88 L295,90 L285,88 L278,85 Z"/>
    </g>

    <!-- Date points will be added by JS -->
    <g id="points"></g>
  </svg>

  <script>
    var points = ${pointsJSON};
    var tooltip = document.getElementById('tooltip');
    var pointsGroup = document.getElementById('points');
    var svgEl = document.getElementById('map');

    // Map lat/lng to SVG coordinates
    // viewBox: -20 -10 380 210, so x range: -20..360, y range: -10..200
    // lng: -180..180 -> 0..360 (offset by 180)
    // lat: 90..-90 -> 0..180 (inverted)
    function toSVG(lat, lng) {
      var x = (lng + 180) * (340 / 360) + 0;
      var y = (90 - lat) * (190 / 180) + 0;
      return { x: x, y: y };
    }

    function renderPoints() {
      pointsGroup.innerHTML = '';

      points.forEach(function(p) {
        var pos = toSVG(p.lat, p.lng);
        var baseR = 2;
        var r = Math.min(baseR + Math.log2(p.count + 1) * 1.2, 6);

        // Outer glow circle
        var glowCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        glowCircle.setAttribute('cx', pos.x);
        glowCircle.setAttribute('cy', pos.y);
        glowCircle.setAttribute('r', r + 2);
        glowCircle.setAttribute('fill', p.color);
        glowCircle.setAttribute('opacity', '0.25');
        glowCircle.setAttribute('filter', 'url(#dotGlow)');
        pointsGroup.appendChild(glowCircle);

        // Main dot
        var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', pos.x);
        circle.setAttribute('cy', pos.y);
        circle.setAttribute('r', r);
        circle.setAttribute('fill', p.color);
        circle.setAttribute('opacity', '0.9');
        circle.setAttribute('class', 'dot');
        circle.setAttribute('filter', 'url(#dotGlow)');

        // Inner bright core
        var core = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        core.setAttribute('cx', pos.x);
        core.setAttribute('cy', pos.y);
        core.setAttribute('r', r * 0.4);
        core.setAttribute('fill', '#ffffff');
        core.setAttribute('opacity', '0.6');
        core.setAttribute('class', 'dot');

        // Touch area (invisible, larger)
        var touchArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        touchArea.setAttribute('cx', pos.x);
        touchArea.setAttribute('cy', pos.y);
        touchArea.setAttribute('r', Math.max(r + 6, 10));
        touchArea.setAttribute('fill', 'transparent');
        touchArea.setAttribute('class', 'dot');

        touchArea.addEventListener('click', function(e) {
          e.stopPropagation();
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'cityPress',
            cityId: p.cityId,
            cityName: p.cityName,
            dateId: p.id,
            isFriend: p.isFriend,
          }));
        });

        touchArea.addEventListener('touchstart', function(e) {
          var rect = svgEl.getBoundingClientRect();
          var tx = e.touches[0].clientX;
          var ty = e.touches[0].clientY;
          tooltip.textContent = p.cityName + ' (' + p.count + ')';
          tooltip.style.left = tx + 'px';
          tooltip.style.top = (ty - 35) + 'px';
          tooltip.classList.add('visible');
        });

        touchArea.addEventListener('touchend', function() {
          tooltip.classList.remove('visible');
        });

        pointsGroup.appendChild(circle);
        pointsGroup.appendChild(core);
        pointsGroup.appendChild(touchArea);
      });
    }

    renderPoints();

    // Pulse animation for dots
    var pulsePhase = 0;
    function animate() {
      pulsePhase += 0.03;
      var dots = pointsGroup.querySelectorAll('circle.dot:not([fill="transparent"])');
      dots.forEach(function(dot, i) {
        if (dot.getAttribute('fill') === '#ffffff') return;
        var scale = 1 + Math.sin(pulsePhase + i * 0.5) * 0.08;
        var cx = dot.getAttribute('cx');
        var cy = dot.getAttribute('cy');
        dot.setAttribute('transform', 'translate(' + cx * (1 - scale) + ',' + cy * (1 - scale) + ') scale(' + scale + ')');
      });
      requestAnimationFrame(animate);
    }
    animate();
  </script>
</body>
</html>`;
}

export const GlobeWebView: React.FC<GlobeWebViewProps> = ({
  dates,
  friendDates,
  filter,
  onCityPress,
  onDatePress,
}) => {
  const webViewRef = useRef<WebView>(null);

  const points = useMemo(
    () => buildPoints(dates, friendDates, filter),
    [dates, friendDates, filter],
  );

  const html = useMemo(() => generateMapHTML(points), [points]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'cityPress') {
          onCityPress(data.cityId);
          onDatePress?.(data.dateId, data.isFriend);
        }
      } catch {
        // ignore parse errors
      }
    },
    [onCityPress, onDatePress],
  );

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={handleMessage}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled={false}
        startInLoadingState={false}
        backgroundColor={colors.background.primary}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

// Chart generator for Luminex token price charts
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import axios from 'axios';

const LUMINEX_API_URL = 'https://api.luminex.io';

// Create chart renderer
const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width: 800,
  height: 400,
  backgroundColour: '#1e1e1e', // Dark background
});

// Fetch chart data from TradingView endpoint
export async function fetchChartData(tokenIdentifier, resolution = 15, hours = 24) {
  if (!tokenIdentifier) {
    throw new Error('token_identifier is required');
  }

  const now = Math.floor(Date.now() / 1000);
  const from = now - (hours * 3600);
  const to = now;
  const countback = Math.ceil((hours * 3600) / (resolution * 60));

  try {
    const res = await axios.get(
      `${LUMINEX_API_URL}/tv/chart/history`,
      {
        params: {
          symbol: tokenIdentifier,
          resolution,
          from,
          to,
          countback,
        },
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      }
    );

    if (res.data.s === 'ok') {
      return res.data;
    } else {
      throw new Error(`Chart API returned status: ${res.data.s}`);
    }
  } catch (error) {
    console.error(`Error fetching chart data for ${tokenIdentifier.substring(0, 20)}...:`, error.message);
    throw error;
  }
}

// Generate chart image from OHLCV data
export async function generateChartImage(chartData, tokenName = 'Token', currentPrice = null) {
  if (!chartData || !chartData.t || chartData.t.length === 0) {
    throw new Error('No chart data available');
  }

  const timestamps = chartData.t;
  const closes = chartData.c;
  const opens = chartData.o;
  const highs = chartData.h;
  const lows = chartData.l;
  const volumes = chartData.v;

  // Format timestamps for labels
  const labels = timestamps.map(ts => {
    const date = new Date(ts * 1000);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  });

  // Determine chart color based on price trend
  const firstPrice = closes[0];
  const lastPrice = closes[closes.length - 1];
  const isUp = lastPrice >= firstPrice;
  const chartColor = isUp ? '#00ff88' : '#ff4444'; // Green for up, red for down

  const configuration = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Price (USD)',
          data: closes,
          borderColor: chartColor,
          backgroundColor: chartColor + '33', // 20% opacity
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 0, // Hide points for cleaner look
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: true,
          text: `${tokenName} Price Chart (${timestamps.length} data points)`,
          color: '#ffffff',
          font: {
            size: 16,
            weight: 'bold',
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#888888',
            maxTicksLimit: 10,
          },
          grid: {
            color: '#333333',
          },
        },
        y: {
          ticks: {
            color: '#888888',
            callback: function(value) {
              // Format very small numbers
              if (value < 0.0001) {
                return value.toExponential(2);
              }
              return value.toFixed(8);
            },
          },
          grid: {
            color: '#333333',
          },
        },
      },
      backgroundColor: '#1e1e1e',
    },
    plugins: [
      {
        id: 'background',
        beforeDraw: (chart) => {
          const ctx = chart.canvas.getContext('2d');
          ctx.save();
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = '#1e1e1e';
          ctx.fillRect(0, 0, chart.width, chart.height);
          ctx.restore();
        },
      },
    ],
  };

  try {
    const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
    return imageBuffer;
  } catch (error) {
    console.error('Error generating chart image:', error);
    throw error;
  }
}


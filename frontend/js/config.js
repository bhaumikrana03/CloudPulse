/* Where the CloudPulse backend lives. Served by the backend itself it uses the same address;
   opened any other way (file or another server) it falls back to localhost:5001. */
window.CLOUDPULSE_API = window.CLOUDPULSE_API || (location.port === '5001' ? location.origin : 'http://localhost:5001');

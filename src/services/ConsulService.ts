// Consul Service Discovery for Lily UI

export interface ConsulService {
    id: string;
    name: string;
    address: string;
    port: number;
    tags: string[];
    health: 'passing' | 'critical' | 'unknown';
    hostname?: string;
}

export interface ConsulServiceGroup {
    name: string;
    services: ConsulService[];
}

class ConsulServiceDiscovery {
    private consulApiUrl: string | null = null;
    private refreshInterval: number | null = null;
    private listeners: ((services: ConsulServiceGroup[]) => void)[] = [];
    private cachedServices: ConsulServiceGroup[] = [];
    private urlInitPromise: Promise<void> | null = null;

    /**
     * Initialize the Consul API URL (lazy async init)
     */
    private async initConsulUrl(): Promise<void> {
        if (this.consulApiUrl) return;
        if (this.urlInitPromise) return this.urlInitPromise;

        this.urlInitPromise = (async () => {
            // Get domain from environment variable (consistent with old urlUtils logic)
            const domainName = import.meta.env.VITE_DOMAIN_NAME || "localhost";
            const isLocalhost = domainName.includes("localhost") || domainName.includes("127.0.0.1");

            if (isLocalhost) {
                // For localhost, assume Consul is on port 8500
                this.consulApiUrl = `http://${domainName}:8500/v1`;
            } else {
                // For production, assume consul-api subdomain
                this.consulApiUrl = `https://consul-api.${domainName}/v1`;
            }
        })();

        return this.urlInitPromise;
    }

    /**
     * Start periodic service discovery
     */
    async startPeriodicDiscovery(intervalMs: number = 30000): Promise<void> {
        await this.initConsulUrl();
        // Initial fetch
        await this.discoverAllServices();

        // Set up periodic refresh
        this.refreshInterval = window.setInterval(() => {
            this.discoverAllServices();
        }, intervalMs);
    }

    /**
     * Stop periodic discovery
     */
    stopPeriodicDiscovery(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    /**
     * Register a listener for service updates
     */
    addListener(callback: (services: ConsulServiceGroup[]) => void): void {
        this.listeners.push(callback);
        // Immediately notify with cached data
        callback(this.cachedServices);
    }

    /**
     * Remove a listener
     */
    removeListener(callback: (services: ConsulServiceGroup[]) => void): void {
        this.listeners = this.listeners.filter(l => l !== callback);
    }

    /**
     * Discover all registered services from Consul
     */
    async discoverAllServices(): Promise<ConsulServiceGroup[]> {
        await this.initConsulUrl();
        try {
            // Step 1: Get list of service names
            const response = await fetch(`${this.consulApiUrl}/catalog/services`);

            if (!response.ok) {
                throw new Error(`Consul API error: ${response.status}`);
            }

            const data = await response.json();
            const serviceNames = Object.keys(data);

            // Step 2: Get details for each service in parallel
            const servicePromises = serviceNames.map(name => this.discoverServiceByName(name, false));
            const results = await Promise.all(servicePromises);

            const allServices: ConsulService[] = [];
            results.forEach(services => {
                allServices.push(...services);
            });

            // Step 3: Group and Cache
            this.cachedServices = this.groupByName(allServices);

            // Notify listeners
            this.listeners.forEach(listener => listener(this.cachedServices));

            return this.cachedServices;
        } catch (error) {
            console.error('Failed to discover services from Consul:', error);
            return this.cachedServices;
        }
    }

    /**
     * Discover services filtered by name
     */
    async discoverServiceByName(serviceName: string, passingOnly: boolean = true): Promise<ConsulService[]> {
        await this.initConsulUrl();
        try {
            const queryParams = passingOnly ? '?passing=true' : '';
            const response = await fetch(`${this.consulApiUrl}/health/service/${serviceName}${queryParams}`);

            if (!response.ok) {
                throw new Error(`Consul API error: ${response.status}`);
            }

            const data = await response.json();
            const services = this.parseHealthServices(data);

            // Populate hostname from tags
            for (const service of services) {
                // Check for explicit "hostname=" tag from service registration
                const hostnameTag = service.tags.find(t => t.startsWith('hostname='));
                if (hostnameTag) {
                    service.hostname = hostnameTag.substring(9);
                }
            }

            return services;
        } catch (error) {
            console.error(`Failed to discover service ${serviceName}:`, error);
            return [];
        }
    }

    /**
     * Get a service's hostname by name
     */
    async getServiceHostname(serviceName: string): Promise<string> {
        // Try to find in cache first to avoid extra requests if possible,
        // but discoverServiceByName updates cache? No, discoverServiceByName fetches fresh.
        // We'll fetch fresh to be safe or maybe check cache?
        // Let's use discoverServiceByName.
        const services = await this.discoverServiceByName(serviceName);
        const service = services.find(s => s.hostname);
        return service?.hostname || '';
    }

    /**
     * Get Lily-Core WebSocket URL
     */
    async getLilyCoreWsUrl(): Promise<string> {
        const hostname = await this.getServiceHostname('lily-core');
        if (!hostname) return '';
        return `wss://${hostname}/ws`;
    }

    /**
     * Get Lily-Core HTTP URL
     */
    async getLilyCoreHttpUrl(): Promise<string> {
        const hostname = await this.getServiceHostname('lily-core');
        if (!hostname) return '';
        return `https://${hostname}/api`;
    }


    /**
     * Parse Consul API response (health service format)
     */
    private parseHealthServices(data: any[]): ConsulService[] {
        return data.map(item => {
            const service = item.Service || {};
            const checks = item.Checks || [];

            // Determine health status
            let health: 'passing' | 'critical' | 'unknown' = 'unknown';
            for (const check of checks) {
                if (check.Status !== 'passing') {
                    health = 'critical';
                    break;
                }
            }
            if (health !== 'critical' && checks.length > 0) {
                health = 'passing';
            }

            return {
                id: service.ID || '',
                name: service.Service || '',
                address: service.Address || '',
                port: service.Port || 0,
                tags: service.Tags || [],
                health
            };
        });
    }

    /**
     * Group services by name
     */
    private groupByName(services: ConsulService[]): ConsulServiceGroup[] {
        const groups: Map<string, ConsulService[]> = new Map();

        for (const service of services) {
            if (!groups.has(service.name)) {
                groups.set(service.name, []);
            }
            groups.get(service.name)!.push(service);
        }

        return Array.from(groups.entries()).map(([name, services]) => ({
            name,
            services
        }));
    }

    /**
     * Get service count
     */
    getServiceCount(): number {
        return this.cachedServices.reduce((count, group) => count + group.services.length, 0);
    }

    /**
     * Get all service names
     */
    getServiceNames(): string[] {
        return this.cachedServices.map(group => group.name);
    }
}

// Create singleton instance
const consulService = new ConsulServiceDiscovery();
export default consulService;

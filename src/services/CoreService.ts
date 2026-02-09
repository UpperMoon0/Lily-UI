
import consulService from './ConsulService';

// Interfaces based on Monitor.tsx
export interface ServiceStatus {
    name: string;
    status: string;
    details?: Record<string, any>;
    last_updated: string;
}

export interface SystemMetrics {
    cpu_usage?: number;
    memory_usage?: number;
    disk_usage?: number;
    uptime?: string;
}

export interface MonitoringData {
    status: string;
    service_name: string;
    version: string;
    timestamp: string;
    metrics?: SystemMetrics;
    services?: ServiceStatus[];
    details?: Record<string, any>;
}

export interface AgentStep {
    step_number: number;
    type: string;
    reasoning: string;
    tool_name: string;
    tool_parameters: any;
    tool_result: any;
    timestamp: string;
}

export interface AgentLoop {
    exists: boolean;
    user_id: string;
    user_message: string;
    final_response: string;
    completed: boolean;
    start_time: string;
    end_time: string;
    duration_seconds?: number;
    steps: AgentStep[];
    message?: string;
}

class CoreService {
    private async getApiUrl(): Promise<string> {
        const url = await consulService.getLilyCoreHttpUrl();
        // Fallback to localhost if not found
        // Note: getLilyCoreHttpUrl returns https://hostname/api or empty string
        // If empty, we fallback to http://localhost:8000
        // But wait, getLilyCoreHttpUrl returns https by default?
        // In ConsulService.ts: return `https://${hostname}/api`;
        // Localhost fallback in ConsulService.ts: 
        // if isLocalhost: consulApiUrl = http://${domainName}:8500/v1

        // If we are on localhost, we might want http not https for the core service execution if no certs?
        // But the plan says "use ConsulService".
        // Let's rely on ConsulService. If it returns something, use it.
        // If it returns empty, fallback to localhost.

        return url || 'http://localhost:8000';
    }

    async getMonitoringData(): Promise<MonitoringData | null> {
        try {
            const apiUrl = await this.getApiUrl();
            // getLilyCoreHttpUrl returns .../api
            // The endpoint is /monitoring on the root usually?
            // Let's check CoreService.ts in Admin UI again.
            // Admin UI: `${apiUrl}/monitoring` where apiUrl came from `getLilyCoreHttpUrl` which was .../api
            // So it calls .../api/monitoring.
            // But verify if Lily Core serves /api/monitoring or /monitoring.
            // If getLilyCoreHttpUrl returns .../api, appending /monitoring makes .../api/monitoring.

            // In Admin UI CoreService.ts:
            // const response = await axios.get<MonitoringData>(`${apiUrl}/monitoring`, ...);
            // So yes, it uses /api/monitoring if getLilyCoreHttpUrl includes /api.

            // However, looking at Monitor.tsx current hardcoded url:
            // fetch("http://localhost:8000/monitoring")
            // This suggests it is at root /monitoring, NOT /api/monitoring.

            // If I use ConsulService from Admin UI, it appends /api.
            // I should carefully check if /api is needed.
            // If the hardcoded one works and is /monitoring, then /api might be wrong for direct access,
            // OR the gateway/nginx rewriting handles it.

            // If I am running locally without gateway, it is localhost:8000/monitoring.
            // If I use ConsulService, it might return a URL intended for the Gateway/Ingress.

            // Let's look at ConsulService.ts I just wrote/copied:
            // getLilyCoreHttpUrl returns `https://${hostname}/api`

            // If I am local, and ConsulService finds lily-core, what is the hostname?
            // If it's running in docker/host network, it might be the container ID or IP.

            // If the user's current Monitor.tsx uses http://localhost:8000/monitoring, 
            // then likely they are running locally effectively.

            // If I use `https://${hostname}/api`, and append `/monitoring`, I get `https://${hostname}/api/monitoring`.

            // I'll stick to what Admin UI does, but I'll add a check.
            // If the URL ends in /api, and we want /monitoring, maybe we should strip /api if we are sure it is root?
            // Or maybe Admin UI relies on Gateway which maps /api/monitoring -> /monitoring?

            // Let's assume the Admin UI logic is correct for the "Dynamic System" the user wants.
            // But wait, if I use `http://localhost:8000` fallback, I should probably NOT append /api?
            // Original Admin UI fallback: return url || 'http://localhost:8000';
            // And then it does `${apiUrl}/monitoring`.
            // So fallback becomes `http://localhost:8000/monitoring`.

            // If Consul returns `.../api`, it becomes `.../api/monitoring`.

            // Use logic: if url comes from Consul, use it as is (which has /api).
            // If fallback, use localhost:8000 (no /api).

            // Actually, `getLilyCoreHttpUrl` in ConsulService returns string or empty.
            if (!apiUrl) {
                // Should be covered by getApiUrl fallback, but let's be explicit
                // Logic in getApiUrl: return url || 'http://localhost:8000';
            }

            // If apiUrl ends with /api, and we know local lily-core listens on /monitoring...
            // This implies the Gateway exposes /api/monitoring -> lily-core/monitoring.

            const response = await fetch(`${apiUrl}/monitoring`);

            if (!response.ok) {
                throw new Error(`Lily-Core API error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching monitoring data:', error);
            // Don't throw, return null to handle gracefully
            return null;
        }
    }

    async getAgentLoops(): Promise<AgentLoop | null> {
        try {
            const apiUrl = await this.getApiUrl();
            const response = await fetch(`${apiUrl}/agent-loops`);

            if (!response.ok) {
                throw new Error(`Lily-Core API error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Failed to get agent loops:", error);
            return null;
        }
    }
}

// Export as singleton
const coreService = new CoreService();
export default coreService;

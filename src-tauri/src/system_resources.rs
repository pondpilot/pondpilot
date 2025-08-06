use sysinfo::System;

#[derive(Debug, Clone)]
pub struct ResourceLimits {
    // TODO: Use for primary connection configuration
    #[allow(dead_code)]
    pub primary_memory: String,
    // TODO: Use for primary connection thread configuration
    #[allow(dead_code)]
    pub primary_threads: usize,
    pub pool_memory: String,
    pub pool_threads: usize,
}

pub fn calculate_resource_limits() -> ResourceLimits {
    let mut sys = System::new_all();
    sys.refresh_all();
    
    let total_memory_mb = (sys.total_memory() / 1024 / 1024) as usize;
    let cpu_count = sys.cpus().len();
    
    // Primary connection gets 25% of memory (max 8GB) and 50% of CPU cores
    let primary_memory_mb = std::cmp::min(
        (total_memory_mb as f64 * 0.25) as usize,
        8192
    );
    let primary_threads = std::cmp::max(
        (cpu_count as f64 * 0.50) as usize,
        2
    );
    
    // Pool connections get 10% of memory (max 2GB) and 25% of CPU cores
    let pool_memory_mb = std::cmp::min(
        (total_memory_mb as f64 * 0.10) as usize,
        2048
    );
    let pool_threads = std::cmp::max(
        (cpu_count as f64 * 0.25) as usize,
        1
    );
    
    ResourceLimits {
        primary_memory: format!("{}MB", primary_memory_mb),
        primary_threads,
        pool_memory: format!("{}MB", pool_memory_mb),
        pool_threads,
    }
}

pub fn get_total_memory() -> usize {
    let mut sys = System::new_all();
    sys.refresh_all();
    sys.total_memory() as usize
}
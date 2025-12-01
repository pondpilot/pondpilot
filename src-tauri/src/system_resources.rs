use sysinfo::System;
use tracing::info;

const PRIMARY_MEMORY_RATIO: f64 = 0.50; // Give the primary connection half of host RAM
const PRIMARY_MEMORY_CAP_MB: usize = 16 * 1024; // Cap at 16GB to avoid unbounded allocations
const MIN_PRIMARY_MEMORY_MB: usize = 2 * 1024; // Ensure we still have a couple GB on beefy boxes
const PRIMARY_THREAD_RATIO: f64 = 0.85; // Let the primary connection saturate most CPU cores
const MIN_PRIMARY_THREADS: usize = 2;

const MAX_POOL_MEMORY_BUDGET_RATIO: f64 = 0.80; // Never let pooled connections consume >80% combined
const HEAVY_QUERY_CONCURRENCY_TARGET: f64 = 4.0; // Comparison workloads routinely drive 4 pooled conns
const POOL_MEMORY_RATIO: f64 = MAX_POOL_MEMORY_BUDGET_RATIO / HEAVY_QUERY_CONCURRENCY_TARGET; // 0.2 each
const POOL_MEMORY_CAP_MB: usize = 8 * 1024; // Cap per-connection RAM to 8GB (4x the previous ceiling)
const MIN_POOL_MEMORY_MB: usize = 512;
const POOL_THREAD_RATIO: f64 = 0.55; // Heavier than before but still leaves headroom for concurrency
const MIN_POOL_THREADS: usize = 2;

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

    // Primary connection takes a large slice of resources (currently unused but reserved)
    let primary_memory_mb = calculate_memory_limit(
        total_memory_mb,
        PRIMARY_MEMORY_RATIO,
        PRIMARY_MEMORY_CAP_MB,
        MIN_PRIMARY_MEMORY_MB,
    );
    let primary_threads =
        calculate_thread_limit(cpu_count, PRIMARY_THREAD_RATIO, MIN_PRIMARY_THREADS);

    // Pool connections should be aggressive so desktop queries finish fast.
    let pool_memory_mb = calculate_memory_limit(
        total_memory_mb,
        POOL_MEMORY_RATIO,
        POOL_MEMORY_CAP_MB,
        MIN_POOL_MEMORY_MB,
    );
    let pool_threads = calculate_thread_limit(cpu_count, POOL_THREAD_RATIO, MIN_POOL_THREADS);

    let limits = ResourceLimits {
        primary_memory: format!("{}MB", primary_memory_mb),
        primary_threads,
        pool_memory: format!("{}MB", pool_memory_mb),
        pool_threads,
    };

    info!(
        "[SYSTEM_RESOURCES] total_ram={}MB cpu_count={} -> primary {} @ {} threads, pool {} @ {} threads",
        total_memory_mb, cpu_count, limits.primary_memory, limits.primary_threads, limits.pool_memory, limits.pool_threads
    );

    limits
}

fn calculate_memory_limit(
    total_memory_mb: usize,
    ratio: f64,
    cap_mb: usize,
    min_mb: usize,
) -> usize {
    if total_memory_mb == 0 {
        return min_mb;
    }

    let desired = ((total_memory_mb as f64) * ratio).round() as usize;
    let upper_bound = cap_mb.min(total_memory_mb.max(1));
    let lower_bound = std::cmp::min(min_mb, upper_bound);
    desired.clamp(lower_bound, upper_bound)
}

fn calculate_thread_limit(cpu_count: usize, ratio: f64, min_threads: usize) -> usize {
    let available = cpu_count.max(1);
    if available == 1 {
        return 1;
    }

    let desired = ((available as f64) * ratio).ceil() as usize;
    desired.clamp(std::cmp::min(min_threads, available), available)
}

pub fn get_total_memory() -> usize {
    let mut sys = System::new_all();
    sys.refresh_all();
    sys.total_memory() as usize
}

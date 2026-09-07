/*
 * AI Usage & Governance
 *
 * Platform-owned persistence for:
 *   - AI usage records
 *   - AI performance telemetry
 *   - AI policy evaluations
 *   - AI request audit logs
 *
 * Provider-neutral and independent of external usage-management
 * or observability products.
 */

CREATE TABLE core.AIUsageRecords (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    user_id UNIQUEIDENTIFIER NULL,
    application_id UNIQUEIDENTIFIER NULL,

    provider NVARCHAR(50) NOT NULL,
    model NVARCHAR(200) NOT NULL,
    request_type NVARCHAR(30) NOT NULL,
    status NVARCHAR(30) NOT NULL,

    correlation_id NVARCHAR(200) NULL,

    started_at DATETIME2(7) NOT NULL,
    completed_at DATETIME2(7) NULL,

    latency_ms BIGINT NULL,

    input_tokens BIGINT NULL,
    output_tokens BIGINT NULL,
    total_tokens BIGINT NULL,

    estimated_cost DECIMAL(19,8) NULL,
    currency NVARCHAR(10) NULL,

    error_code NVARCHAR(200) NULL,
    provider_request_id NVARCHAR(500) NULL,

    source NVARCHAR(100) NOT NULL,

    created_at DATETIME2(7) NOT NULL
        CONSTRAINT DF_AIUsageRecords_CreatedAt
        DEFAULT SYSUTCDATETIME(),

    CONSTRAINT UQ_AIUsageRecords_TenantId_Id
        UNIQUE (tenant_id, id),

    CONSTRAINT CK_AIUsageRecords_RequestType
        CHECK (
            request_type IN (
                'chat',
                'completion',
                'embedding',
                'image',
                'audio',
                'moderation'
            )
        ),

    CONSTRAINT CK_AIUsageRecords_Status
        CHECK (
            status IN (
                'pending',
                'success',
                'error',
                'blocked',
                'rate-limited'
            )
        ),

    CONSTRAINT CK_AIUsageRecords_CompletedAt
        CHECK (
            completed_at IS NULL
            OR completed_at >= started_at
        ),

    CONSTRAINT CK_AIUsageRecords_Latency
        CHECK (
            latency_ms IS NULL
            OR latency_ms >= 0
        ),

    CONSTRAINT CK_AIUsageRecords_InputTokens
        CHECK (
            input_tokens IS NULL
            OR input_tokens >= 0
        ),

    CONSTRAINT CK_AIUsageRecords_OutputTokens
        CHECK (
            output_tokens IS NULL
            OR output_tokens >= 0
        ),

    CONSTRAINT CK_AIUsageRecords_TotalTokens
        CHECK (
            total_tokens IS NULL
            OR total_tokens >= 0
        ),

    CONSTRAINT CK_AIUsageRecords_EstimatedCost
        CHECK (
            estimated_cost IS NULL
            OR estimated_cost >= 0
        )
);

CREATE INDEX IX_AIUsageRecords_TenantStartedAt
    ON core.AIUsageRecords (
        tenant_id,
        started_at DESC
    );

CREATE INDEX IX_AIUsageRecords_TenantApplicationStartedAt
    ON core.AIUsageRecords (
        tenant_id,
        application_id,
        started_at DESC
    );

CREATE INDEX IX_AIUsageRecords_TenantProviderModel
    ON core.AIUsageRecords (
        tenant_id,
        provider,
        model,
        started_at DESC
    );

CREATE INDEX IX_AIUsageRecords_TenantStatus
    ON core.AIUsageRecords (
        tenant_id,
        status,
        started_at DESC
    );

CREATE INDEX IX_AIUsageRecords_Correlation
    ON core.AIUsageRecords (
        tenant_id,
        correlation_id
    );

CREATE INDEX IX_AIUsageRecords_ProviderRequest
    ON core.AIUsageRecords (
        provider,
        provider_request_id
    );


/*
 * AI performance telemetry.
 */
CREATE TABLE core.AIPerformanceRecords (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,

    usage_record_id UNIQUEIDENTIFIER NOT NULL,
    tenant_id UNIQUEIDENTIFIER NOT NULL,

    provider NVARCHAR(50) NOT NULL,
    model NVARCHAR(200) NOT NULL,
    request_type NVARCHAR(30) NOT NULL,

    latency_ms BIGINT NULL,
    time_to_first_token_ms BIGINT NULL,

    input_tokens_per_second DECIMAL(19,8) NULL,
    output_tokens_per_second DECIMAL(19,8) NULL,

    retry_count INT NULL,

    success BIT NOT NULL,

    error_code NVARCHAR(200) NULL,

    recorded_at DATETIME2(7) NOT NULL,

    CONSTRAINT FK_AIPerformanceRecords_UsageRecord
        FOREIGN KEY (tenant_id, usage_record_id)
        REFERENCES core.AIUsageRecords (tenant_id, id),

    CONSTRAINT CK_AIPerformanceRecords_RequestType
        CHECK (
            request_type IN (
                'chat',
                'completion',
                'embedding',
                'image',
                'audio',
                'moderation'
            )
        ),

    CONSTRAINT CK_AIPerformanceRecords_Latency
        CHECK (
            latency_ms IS NULL
            OR latency_ms >= 0
        ),

    CONSTRAINT CK_AIPerformanceRecords_TTFT
        CHECK (
            time_to_first_token_ms IS NULL
            OR time_to_first_token_ms >= 0
        ),

    CONSTRAINT CK_AIPerformanceRecords_InputTPS
        CHECK (
            input_tokens_per_second IS NULL
            OR input_tokens_per_second >= 0
        ),

    CONSTRAINT CK_AIPerformanceRecords_OutputTPS
        CHECK (
            output_tokens_per_second IS NULL
            OR output_tokens_per_second >= 0
        ),

    CONSTRAINT CK_AIPerformanceRecords_RetryCount
        CHECK (
            retry_count IS NULL
            OR retry_count >= 0
        )
);

CREATE INDEX IX_AIPerformanceRecords_TenantRecordedAt
    ON core.AIPerformanceRecords (
        tenant_id,
        recorded_at DESC
    );

CREATE INDEX IX_AIPerformanceRecords_UsageRecord
    ON core.AIPerformanceRecords (
        tenant_id,
        usage_record_id,
        recorded_at ASC
    );

CREATE INDEX IX_AIPerformanceRecords_TenantProviderModel
    ON core.AIPerformanceRecords (
        tenant_id,
        provider,
        model,
        recorded_at DESC
    );


/*
 * AI policy evaluations.
 */
CREATE TABLE core.AIPolicyEvaluations (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,

    usage_record_id UNIQUEIDENTIFIER NOT NULL,
    tenant_id UNIQUEIDENTIFIER NOT NULL,

    policy_id UNIQUEIDENTIFIER NOT NULL,
    policy_version NVARCHAR(100) NULL,

    decision NVARCHAR(30) NOT NULL,
    reason NVARCHAR(2000) NULL,

    evaluated_at DATETIME2(7) NOT NULL,

    evaluation_latency_ms BIGINT NULL,

    CONSTRAINT FK_AIPolicyEvaluations_UsageRecord
        FOREIGN KEY (tenant_id, usage_record_id)
        REFERENCES core.AIUsageRecords (tenant_id, id),

    CONSTRAINT CK_AIPolicyEvaluations_Decision
        CHECK (
            decision IN (
                'allow',
                'block',
                'warn',
                'require-review'
            )
        ),

    CONSTRAINT CK_AIPolicyEvaluations_Latency
        CHECK (
            evaluation_latency_ms IS NULL
            OR evaluation_latency_ms >= 0
        )
);

CREATE INDEX IX_AIPolicyEvaluations_TenantEvaluatedAt
    ON core.AIPolicyEvaluations (
        tenant_id,
        evaluated_at DESC
    );

CREATE INDEX IX_AIPolicyEvaluations_UsageRecord
    ON core.AIPolicyEvaluations (
        tenant_id,
        usage_record_id,
        evaluated_at ASC
    );

CREATE INDEX IX_AIPolicyEvaluations_TenantPolicy
    ON core.AIPolicyEvaluations (
        tenant_id,
        policy_id,
        evaluated_at DESC
    );


/*
 * AI request audit/event history.
 */
CREATE TABLE core.AIRequestLogs (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,

    usage_record_id UNIQUEIDENTIFIER NOT NULL,
    tenant_id UNIQUEIDENTIFIER NOT NULL,

    user_id UNIQUEIDENTIFIER NULL,
    application_id UNIQUEIDENTIFIER NULL,

    correlation_id NVARCHAR(200) NULL,

    event NVARCHAR(50) NOT NULL,

    timestamp DATETIME2(7) NOT NULL,

    metadata_json NVARCHAR(MAX) NULL,

    CONSTRAINT FK_AIRequestLogs_UsageRecord
        FOREIGN KEY (tenant_id, usage_record_id)
        REFERENCES core.AIUsageRecords (tenant_id, id),

    CONSTRAINT CK_AIRequestLogs_Event
        CHECK (
            event IN (
                'request-created',
                'policy-evaluated',
                'request-sent',
                'response-received',
                'request-completed',
                'request-failed',
                'request-blocked',
                'request-rate-limited'
            )
        ),

    CONSTRAINT CK_AIRequestLogs_MetadataJson
        CHECK (
            metadata_json IS NULL
            OR ISJSON(metadata_json) = 1
        )
);

CREATE INDEX IX_AIRequestLogs_TenantTimestamp
    ON core.AIRequestLogs (
        tenant_id,
        timestamp DESC
    );

CREATE INDEX IX_AIRequestLogs_UsageRecordTimestamp
    ON core.AIRequestLogs (
        tenant_id,
        usage_record_id,
        timestamp ASC
    );

CREATE INDEX IX_AIRequestLogs_TenantCorrelation
    ON core.AIRequestLogs (
        tenant_id,
        correlation_id,
        timestamp DESC
    );

CREATE INDEX IX_AIRequestLogs_TenantEvent
    ON core.AIRequestLogs (
        tenant_id,
        event,
        timestamp DESC
    );
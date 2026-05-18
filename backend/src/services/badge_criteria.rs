// Sponsored badge'ler için kriter evaluator'ı.
//
// `badges.criteria` JSONB spec'ini alır, kullanıcının `dates` + `connections`
// verilerine karşı koşulları değerlendirir. Tüm condition'lar AND ile
// birleşir; herhangi biri başarısız olursa false döner.
//
// Spec şeması (TS karşılığı api.ts'de):
//   { conditions: [
//       { type: 'count',  min: i64, filter: DateFilter },
//       { type: 'distinct', field, min, filter? },
//       { type: 'avg_rating', field, min_avg, min_sample, filter? },
//       { type: 'friend_count', min }
//     ] }
//
// Performans: condition başına 1 SQL sorgusu (genelde 2-4 condition);
// her sorgu indexler üzerinden ms cinsinde. check_and_award_badges
// içinde sadece criteria IS NOT NULL olan badge'ler için çağrılır.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, QueryBuilder};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct BadgeCriteria {
    pub conditions: Vec<Condition>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Condition {
    Count {
        min: i64,
        #[serde(default)]
        filter: DateFilter,
    },
    Distinct {
        field: DistinctField,
        min: i64,
        #[serde(default)]
        filter: DateFilter,
    },
    AvgRating {
        field: RatingField,
        min_avg: f64,
        min_sample: i64,
        #[serde(default)]
        filter: DateFilter,
    },
    FriendCount {
        min: i64,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum DistinctField {
    CountryCode,
    CityId,
}

impl DistinctField {
    fn column(&self) -> &'static str {
        match self {
            DistinctField::CountryCode => "country_code",
            DistinctField::CityId => "city_id",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum RatingField {
    Rating,
    FaceRating,
    BodyRating,
    ChatRating,
}

impl RatingField {
    fn column(&self) -> &'static str {
        match self {
            RatingField::Rating => "rating",
            RatingField::FaceRating => "face_rating",
            RatingField::BodyRating => "body_rating",
            RatingField::ChatRating => "chat_rating",
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct DateFilter {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gender: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub age_range: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height_range: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub country_code: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub city_id: Option<Vec<i32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_rating: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_face_rating: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_body_rating: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_chat_rating: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub any_tags: Option<Vec<i32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date_after: Option<NaiveDate>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date_before: Option<NaiveDate>,
}

impl DateFilter {
    /// QueryBuilder'a WHERE clause ekler. `dates` tablosunun alias'ı 'd'
    /// olarak varsayılır.
    fn push_where(&self, qb: &mut QueryBuilder<'_, sqlx::Postgres>) {
        if let Some(v) = &self.gender {
            if !v.is_empty() {
                qb.push(" AND d.gender = ANY(");
                qb.push_bind(v.clone());
                qb.push(")");
            }
        }
        if let Some(v) = &self.age_range {
            if !v.is_empty() {
                qb.push(" AND d.age_range = ANY(");
                qb.push_bind(v.clone());
                qb.push(")");
            }
        }
        if let Some(v) = &self.height_range {
            if !v.is_empty() {
                qb.push(" AND d.height_range = ANY(");
                qb.push_bind(v.clone());
                qb.push(")");
            }
        }
        if let Some(v) = &self.country_code {
            if !v.is_empty() {
                qb.push(" AND d.country_code = ANY(");
                qb.push_bind(v.clone());
                qb.push(")");
            }
        }
        if let Some(v) = &self.city_id {
            if !v.is_empty() {
                qb.push(" AND d.city_id = ANY(");
                qb.push_bind(v.clone());
                qb.push(")");
            }
        }
        if let Some(n) = self.min_rating {
            qb.push(" AND d.rating >= ");
            qb.push_bind(n);
        }
        if let Some(n) = self.min_face_rating {
            qb.push(" AND d.face_rating IS NOT NULL AND d.face_rating >= ");
            qb.push_bind(n);
        }
        if let Some(n) = self.min_body_rating {
            qb.push(" AND d.body_rating IS NOT NULL AND d.body_rating >= ");
            qb.push_bind(n);
        }
        if let Some(n) = self.min_chat_rating {
            qb.push(" AND d.chat_rating IS NOT NULL AND d.chat_rating >= ");
            qb.push_bind(n);
        }
        if let Some(v) = &self.any_tags {
            if !v.is_empty() {
                qb.push(
                    " AND EXISTS (SELECT 1 FROM date_tags dt \
                     WHERE dt.date_id = d.id AND dt.tag_id = ANY(",
                );
                qb.push_bind(v.clone());
                qb.push("))");
            }
        }
        if let Some(d) = self.date_after {
            qb.push(" AND d.date_at >= ");
            qb.push_bind(d);
        }
        if let Some(d) = self.date_before {
            qb.push(" AND d.date_at <= ");
            qb.push_bind(d);
        }
    }
}

/// Ana evaluator. Tüm condition'lar AND ile birleşir. Boş conditions
/// listesi → false (anlamsız bir spec, unlock olmasın).
pub async fn evaluate(
    db: &PgPool,
    user_id: Uuid,
    criteria: &BadgeCriteria,
) -> Result<bool, sqlx::Error> {
    if criteria.conditions.is_empty() {
        return Ok(false);
    }
    for cond in &criteria.conditions {
        if !evaluate_condition(db, user_id, cond).await? {
            return Ok(false);
        }
    }
    Ok(true)
}

async fn evaluate_condition(
    db: &PgPool,
    user_id: Uuid,
    cond: &Condition,
) -> Result<bool, sqlx::Error> {
    match cond {
        Condition::Count { min, filter } => {
            let mut qb = QueryBuilder::new(
                "SELECT COUNT(*)::bigint FROM dates d \
                 WHERE d.user_id = ",
            );
            qb.push_bind(user_id);
            qb.push(" AND d.deleted_at IS NULL");
            filter.push_where(&mut qb);
            let count: i64 = qb.build_query_scalar().fetch_one(db).await?;
            Ok(count >= *min)
        }
        Condition::Distinct { field, min, filter } => {
            let mut qb = QueryBuilder::new(format!(
                "SELECT COUNT(DISTINCT d.{})::bigint FROM dates d \
                 WHERE d.user_id = ",
                field.column()
            ));
            qb.push_bind(user_id);
            qb.push(" AND d.deleted_at IS NULL");
            filter.push_where(&mut qb);
            let count: i64 = qb.build_query_scalar().fetch_one(db).await?;
            Ok(count >= *min)
        }
        Condition::AvgRating {
            field,
            min_avg,
            min_sample,
            filter,
        } => {
            let col = field.column();
            let mut qb = QueryBuilder::new(format!(
                "SELECT AVG(d.{col})::float8 AS avg_val, COUNT(*)::bigint AS sample \
                 FROM dates d \
                 WHERE d.user_id = ",
            ));
            qb.push_bind(user_id);
            qb.push(format!(
                " AND d.deleted_at IS NULL AND d.{col} IS NOT NULL"
            ));
            filter.push_where(&mut qb);
            let row: (Option<f64>, i64) =
                qb.build_query_as().fetch_one(db).await?;
            let (avg_val, sample) = row;
            if sample < *min_sample {
                return Ok(false);
            }
            Ok(avg_val.map_or(false, |v| v >= *min_avg))
        }
        Condition::FriendCount { min } => {
            let count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*)::bigint FROM connections \
                 WHERE (requester_id = $1 OR responder_id = $1) AND status = 'accepted'",
            )
            .bind(user_id)
            .fetch_one(db)
            .await?;
            Ok(count >= *min)
        }
    }
}

// ── Spec validation (admin POST tarafında çağrılır) ──────────

pub fn validate_criteria(criteria: &BadgeCriteria) -> Result<(), String> {
    if criteria.conditions.is_empty() {
        return Err("criteria.conditions must not be empty".into());
    }
    if criteria.conditions.len() > 10 {
        return Err("criteria.conditions: max 10 conditions".into());
    }
    for (i, cond) in criteria.conditions.iter().enumerate() {
        validate_condition(cond).map_err(|e| format!("condition[{i}]: {e}"))?;
    }
    Ok(())
}

fn validate_condition(cond: &Condition) -> Result<(), String> {
    match cond {
        Condition::Count { min, filter } => {
            if *min < 1 {
                return Err("count.min must be >= 1".into());
            }
            validate_filter(filter)
        }
        Condition::Distinct { min, filter, .. } => {
            if *min < 1 {
                return Err("distinct.min must be >= 1".into());
            }
            validate_filter(filter)
        }
        Condition::AvgRating {
            min_avg,
            min_sample,
            filter,
            ..
        } => {
            if !(1.0..=10.0).contains(min_avg) {
                return Err("avg_rating.min_avg must be in [1.0, 10.0]".into());
            }
            if *min_sample < 1 {
                return Err("avg_rating.min_sample must be >= 1".into());
            }
            validate_filter(filter)
        }
        Condition::FriendCount { min } => {
            if *min < 1 {
                return Err("friend_count.min must be >= 1".into());
            }
            Ok(())
        }
    }
}

const VALID_GENDERS: &[&str] = &["male", "female", "other"];
const VALID_AGE_RANGES: &[&str] =
    &["18-22", "23-27", "28-32", "33-37", "38-42", "43+"];
const VALID_HEIGHT_RANGES: &[&str] = &[
    "-150", "150-160", "160-165", "165-170", "170-175", "175-180", "180-185",
    "185-190", "190-195", "195-200", "200+",
];

fn validate_filter(f: &DateFilter) -> Result<(), String> {
    if let Some(v) = &f.gender {
        for g in v {
            if !VALID_GENDERS.contains(&g.as_str()) {
                return Err(format!("filter.gender: invalid value '{g}'"));
            }
        }
    }
    if let Some(v) = &f.age_range {
        for r in v {
            if !VALID_AGE_RANGES.contains(&r.as_str()) {
                return Err(format!("filter.age_range: invalid value '{r}'"));
            }
        }
    }
    if let Some(v) = &f.height_range {
        for r in v {
            if !VALID_HEIGHT_RANGES.contains(&r.as_str()) {
                return Err(format!("filter.height_range: invalid value '{r}'"));
            }
        }
    }
    if let Some(v) = &f.country_code {
        for c in v {
            if c.len() != 2 {
                return Err(format!(
                    "filter.country_code: '{c}' must be 2-char ISO code"
                ));
            }
        }
    }
    for (name, val) in [
        ("min_rating", f.min_rating),
        ("min_face_rating", f.min_face_rating),
        ("min_body_rating", f.min_body_rating),
        ("min_chat_rating", f.min_chat_rating),
    ] {
        if let Some(n) = val {
            if !(1..=10).contains(&n) {
                return Err(format!("filter.{name}: must be in [1, 10]"));
            }
        }
    }
    if let (Some(after), Some(before)) = (f.date_after, f.date_before) {
        if after > before {
            return Err("filter.date_after must be <= filter.date_before".into());
        }
    }
    Ok(())
}

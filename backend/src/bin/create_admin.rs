// CLI for creating brand_admin users.
//
// super_admin DB'de tutulmuyor — env üzerindeki ADMIN_API_NAME +
// ADMIN_API_KEY ile temsil edilir. Bu CLI yalnızca brand_admin
// yaratır.
//
// Usage:
//   cargo run --bin create_admin -- \
//       --email brand@example.com \
//       --password 'TempPass123' \
//       --brand-slug bumble \
//       --display-name 'Bumble Marketing'
//
// must_change_password=TRUE ile yaratılır; ilk login'de force-change.

use sqlx::postgres::PgPoolOptions;
use std::env;
use std::process::ExitCode;

use havesmashed_backend::services::password;

#[derive(Debug)]
struct Args {
    email: String,
    password: String,
    display_name: String,
    brand_slug: String,
}

fn parse_args() -> Result<Args, String> {
    let raw: Vec<String> = env::args().skip(1).collect();
    let mut email = None;
    let mut password = None;
    let mut display_name = None;
    let mut brand_slug = None;

    let mut i = 0;
    while i < raw.len() {
        match raw[i].as_str() {
            "--email" => {
                email = Some(raw.get(i + 1).cloned().ok_or("--email needs value")?);
                i += 2;
            }
            "--password" => {
                password = Some(raw.get(i + 1).cloned().ok_or("--password needs value")?);
                i += 2;
            }
            "--display-name" => {
                display_name =
                    Some(raw.get(i + 1).cloned().ok_or("--display-name needs value")?);
                i += 2;
            }
            "--brand-slug" => {
                brand_slug = Some(raw.get(i + 1).cloned().ok_or("--brand-slug needs value")?);
                i += 2;
            }
            "--help" | "-h" => {
                print_usage();
                std::process::exit(0);
            }
            other => return Err(format!("unknown arg: {other}")),
        }
    }

    Ok(Args {
        email: email.ok_or("--email required")?,
        password: password.ok_or("--password required")?,
        display_name: display_name.ok_or("--display-name required")?,
        brand_slug: brand_slug.ok_or("--brand-slug required")?,
    })
}

fn print_usage() {
    eprintln!(
        "Usage: create_admin --email E --password P --display-name D --brand-slug S\n\
         \n\
         Tüm parametreler zorunlu. super_admin için CLI yok — env'deki\n\
         ADMIN_API_NAME + ADMIN_API_KEY değerlerini kullan.\n\
         \n\
           --email          brand admin email (unique, lowercase önerilir)\n  \
           --password       initial password (ilk login'de zorla değişir)\n  \
           --display-name   görünür ad\n  \
           --brand-slug     mevcut brands.slug değeri"
    );
}

#[tokio::main]
async fn main() -> ExitCode {
    // Reuse the main binary's env loading convention
    let app_env = env::var("APP_ENV").unwrap_or_else(|_| "dev".to_string());
    if app_env != "production" {
        dotenvy::from_filename(".env.dev").ok();
    }

    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("ERROR: {e}\n");
            print_usage();
            return ExitCode::from(2);
        }
    };

    if let Err(e) = password::validate_password_policy(&args.password) {
        eprintln!("ERROR: weak password: {e:?}");
        return ExitCode::from(2);
    }

    let database_url = match env::var("DATABASE_URL") {
        Ok(v) => v,
        Err(_) => {
            eprintln!("ERROR: DATABASE_URL not set");
            return ExitCode::from(1);
        }
    };

    let pool = match PgPoolOptions::new()
        .max_connections(2)
        .connect(&database_url)
        .await
    {
        Ok(p) => p,
        Err(e) => {
            eprintln!("ERROR: database connect failed: {e}");
            return ExitCode::from(1);
        }
    };

    // Resolve brand_id from slug
    let brand_id: uuid::Uuid = match sqlx::query_scalar::<_, uuid::Uuid>(
        "SELECT id FROM brands WHERE slug = $1",
    )
    .bind(&args.brand_slug)
    .fetch_optional(&pool)
    .await
    {
        Ok(Some(id)) => id,
        Ok(None) => {
            eprintln!("ERROR: brand with slug '{}' not found", args.brand_slug);
            return ExitCode::from(1);
        }
        Err(e) => {
            eprintln!("ERROR: brand lookup failed: {e}");
            return ExitCode::from(1);
        }
    };

    // Hash password
    let hash = match password::hash_password(&args.password) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("ERROR: hash failed: {e:?}");
            return ExitCode::from(1);
        }
    };

    // Insert
    let result = sqlx::query(
        r#"
        INSERT INTO admin_users
            (email, password_hash, display_name, role, brand_id, must_change_password)
        VALUES ($1, $2, $3, 'brand_admin', $4, TRUE)
        RETURNING id
        "#,
    )
    .bind(&args.email)
    .bind(&hash)
    .bind(&args.display_name)
    .bind(brand_id)
    .fetch_one(&pool)
    .await;

    match result {
        Ok(row) => {
            let id: uuid::Uuid = sqlx::Row::get(&row, "id");
            println!("✓ Created brand_admin:");
            println!("    id            : {id}");
            println!("    email         : {}", args.email);
            println!("    brand_slug    : {}", args.brand_slug);
            println!("    must_change   : TRUE (first login will force password change)");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("ERROR: insert failed: {e}");
            ExitCode::from(1)
        }
    }
}
